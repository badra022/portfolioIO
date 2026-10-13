import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { DATE_RE } from "@/lib/dates";
import type { SiteEnv } from "@/lib/environments";
import { cairoDay } from "@/lib/analytics";
import type { QuizT } from "@/lib/schema";
import { MAX_ROWS, cleanRow, findResult, mergeRows, type MergeSummary, type ResultRow } from "@/lib/exam-results";
import { approvedRows } from "./quiz-attempts";

const { examResults, quizAttempts, tenants } = schema;

/** One exam's results as the admin sees them (without the rows). */
export type ResultSetInfo = {
  id: number;
  examId: string | null;
  /** The online quiz whose approved grades are part of these results (lib/server/quiz-attempts.ts), or null. */
  quizPath: string | null;
  /** Approved quiz grades (on the public site), counted in `count`. */
  approved: number;
  title: string;
  date: string;
  total: string | null;
  published: boolean;
  /** Students in the results: rows entered by hand plus approved quiz grades. */
  count: number;
  lookups: number;
  found: number;
  /** The same in the private preview (lib/environments.ts). */
  preview: { published: boolean; lookups: number; found: number };
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};
/** rows = the ones entered by hand or imported; quizRows = the quiz's approved grades (read-only here). */
export type ResultSet = ResultSetInfo & { rows: ResultRow[]; quizRows: ResultRow[] };

/** What the site shows: a published exam students can look their result up in. */
export type PastExam = { id: number; title: string; date: string };

export class ResultsError extends Error {}

async function tenantIdOf(slug: string): Promise<string> {
  const id = (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id;
  if (!id) throw new ResultsError("Teacher not found.");
  return id;
}

/** Approved grades of the set's quiz on the public site. */
const approvedCount = sql<number>`(select count(*) from ${quizAttempts} qa where qa.tenant_id = ${examResults.tenantId} and qa.quiz_path = ${examResults.quizPath} and qa.env = 'production' and qa.approved_at is not null)`.mapWith(Number);

const info = {
  id: examResults.id, examId: examResults.examId, quizPath: examResults.quizPath, approved: approvedCount, title: examResults.title, date: examResults.date, total: examResults.total,
  published: examResults.published, count: sql<number>`jsonb_array_length(${examResults.rows}) + ${approvedCount}`.mapWith(Number),
  lookups: examResults.lookups, found: examResults.found, version: examResults.version,
  updatedAt: examResults.updatedAt, updatedBy: examResults.updatedBy,
  previewPublished: examResults.previewPublished, previewLookups: examResults.previewLookups, previewFound: examResults.previewFound,
};
const toInfo = <T extends { updatedAt: Date; previewPublished: boolean; previewLookups: number; previewFound: number }>({ previewPublished, previewLookups, previewFound, ...r }: T) =>
  ({ ...r, updatedAt: r.updatedAt.toISOString(), preview: { published: previewPublished, lookups: previewLookups, found: previewFound } });

/** Rows as stored: re-cleaned, so whatever reaches the table has the same shape. */
const cleanRows = (rows: unknown[]): ResultRow[] =>
  rows.map((r) => (r && typeof r === "object" ? cleanRow(r as Record<string, unknown>) : null)).filter((r): r is ResultRow => r !== null).slice(0, MAX_ROWS);

/** Title, date and full mark, checked. Messages are Arabic for the admin panel. */
export function cleanMeta(m: { title?: unknown; date?: unknown; total?: unknown }): { title: string; date: string; total: string | null } {
  const title = String(m.title ?? "").trim().slice(0, 120);
  const date = String(m.date ?? "").trim().slice(0, 10);
  const total = String(m.total ?? "").trim().slice(0, 20) || null;
  if (!title) throw new ResultsError("اكتب اسم الامتحان.");
  if (!DATE_RE.test(date)) throw new ResultsError("اختر تاريخ الامتحان.");
  return { title, date, total };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function listResultSets(slug: string): Promise<ResultSetInfo[]> {
  if (!hasDb()) return [];
  const rows = await db().select(info).from(examResults).innerJoin(tenants, eq(tenants.id, examResults.tenantId))
    .where(eq(tenants.slug, slug)).orderBy(desc(examResults.date), desc(examResults.id));
  return rows.map(toInfo);
}

/** One exam's results. quizRows are the approved grades in `env` (the admin's environment). */
export async function getResultSet(slug: string, id: number, env: SiteEnv = "production"): Promise<ResultSet | null> {
  if (!hasDb() || !Number.isInteger(id)) return null;
  const row = (await db().select({ ...info, tenantId: examResults.tenantId, rows: examResults.rows }).from(examResults).innerJoin(tenants, eq(tenants.id, examResults.tenantId))
    .where(and(eq(tenants.slug, slug), eq(examResults.id, id))).limit(1))[0];
  if (!row) return null;
  const { tenantId, rows, ...rest } = row;
  return { ...toInfo(rest), rows: cleanRows(rows as unknown[]), quizRows: rest.quizPath ? await approvedRows(tenantId, rest.quizPath, env) : [] };
}

/** The exam results of a quiz (created if missing), so grading a quiz feeds them. */
export async function quizResultSet(slug: string, quiz: QuizT): Promise<ResultSetInfo | null> {
  if (!hasDb()) return null;
  await ensureQuizResultSets(slug, [quiz]);
  const row = (await db().select(info).from(examResults).innerJoin(tenants, eq(tenants.id, examResults.tenantId))
    .where(and(eq(tenants.slug, slug), eq(examResults.quizPath, quiz.path))).limit(1))[0];
  return row ? toInfo(row) : null;
}

/**
 * Every quiz gets its own exam results, created empty the first time the admin
 * panel lists quizzes or results. They start published: students see the exam in
 * the results list once its first grade is approved (empty results aren't listed).
 */
export async function ensureQuizResultSets(slug: string, quizzes: QuizT[]): Promise<void> {
  if (!hasDb() || !quizzes.length) return;
  const tenantId = (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id;
  if (!tenantId) return;
  const have = new Set((await db().select({ p: examResults.quizPath }).from(examResults)
    .where(and(eq(examResults.tenantId, tenantId), isNotNull(examResults.quizPath)))).map((r) => r.p));
  const missing = quizzes.filter((q) => !have.has(q.path));
  if (!missing.length) return;
  await db().insert(examResults).values(missing.map((q) => {
    // Every question counts toward the full mark, including those the teacher grades by hand.
    const max = q.questions.reduce((a, x) => a + x.points, 0);
    return {
      tenantId, quizPath: q.path, title: q.title.slice(0, 120) || q.path,
      date: q.startsAt?.slice(0, 10) ?? cairoDay(new Date()),
      total: max ? String(max) : null,
      published: true, previewPublished: true, updatedBy: "تلقائي من الاختبار",
    };
  })).onConflictDoNothing();
}

export async function createResultSet(slug: string, m: { examId?: string | null; title?: unknown; date?: unknown; total?: unknown }, author: string): Promise<number> {
  const meta = cleanMeta(m);
  const tenantId = await tenantIdOf(slug);
  const [row] = await db().insert(examResults).values({ tenantId, examId: m.examId?.slice(0, 60) || null, ...meta, updatedBy: author }).returning({ id: examResults.id });
  return row.id;
}

type Where = { slug: string; id: number };
async function update(w: Where, set: Partial<typeof examResults.$inferInsert>, author: string, baseVersion?: number): Promise<number | null> {
  const tenantId = await tenantIdOf(w.slug);
  const cond = [eq(examResults.tenantId, tenantId), eq(examResults.id, w.id)];
  if (baseVersion !== undefined) cond.push(eq(examResults.version, baseVersion));
  const [row] = await db().update(examResults)
    .set({ ...set, version: sql`${examResults.version} + 1`, updatedAt: new Date(), updatedBy: author })
    .where(and(...cond)).returning({ version: examResults.version });
  return row?.version ?? null;
}

/** Title, date, full mark, and whether it shows on the site (published) and in the preview (previewPublished). */
export async function updateResultMeta(slug: string, id: number, m: { title?: unknown; date?: unknown; total?: unknown; published?: boolean; previewPublished?: boolean }, author: string): Promise<void> {
  const current = await getResultSet(slug, id);
  if (!current) throw new ResultsError("الامتحان مش موجود.");
  const meta = cleanMeta({ title: m.title ?? current.title, date: m.date ?? current.date, total: m.total === undefined ? current.total : m.total });
  await update({ slug, id }, { ...meta, published: m.published ?? current.published, previewPublished: m.previewPublished ?? current.preview.published }, author);
}

export type SaveRows = { ok: true; version: number; count: number } | { ok: false; reason: "conflict" | "missing" };

/** Replaces all rows (manual edits). Refused when someone saved in between (baseVersion). */
export async function saveRows(slug: string, id: number, rows: unknown[], baseVersion: number, author: string): Promise<SaveRows> {
  const clean = cleanRows(rows);
  const version = await update({ slug, id }, { rows: clean }, author, baseVersion);
  if (version !== null) return { ok: true, version, count: clean.length };
  return { ok: false, reason: (await getResultSet(slug, id)) ? "conflict" : "missing" };
}

/** Adds imported rows: a student already there (same phone + first name) gets the new score; "replace" starts over. */
export async function importRows(slug: string, id: number, rows: unknown[], mode: "merge" | "replace", author: string): Promise<{ summary: MergeSummary; count: number; version: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getResultSet(slug, id);
    if (!current) throw new ResultsError("الامتحان مش موجود.");
    const merged = mergeRows(current.rows, cleanRows(rows), mode);
    if (merged.rows.length > MAX_ROWS) throw new ResultsError(`الحد الأقصى ${MAX_ROWS} طالب في الامتحان الواحد.`);
    const version = await update({ slug, id }, { rows: merged.rows }, author, current.version);
    if (version !== null) return { summary: merged.summary, count: merged.rows.length, version };
  }
  throw new ResultsError("حد تاني بيعدّل نفس النتايج دلوقتي. حاول تاني.");
}

export async function deleteResultSet(slug: string, id: number): Promise<void> {
  const tenantId = await tenantIdOf(slug);
  // A quiz's results stay (they'd be created again); they can be hidden instead.
  await db().delete(examResults).where(and(eq(examResults.tenantId, tenantId), eq(examResults.id, id), isNull(examResults.quizPath)));
}

/* ------------------------------------------------------------------ */
/* Site                                                                */
/* ------------------------------------------------------------------ */

const publishedIn = (env: SiteEnv) => (env === "preview" ? examResults.previewPublished : examResults.published);

/** Published exams, newest first, for the exams section. Cached with the teacher's page (site.ts). */
export async function publishedExams(tenantId: string, env: SiteEnv): Promise<PastExam[]> {
  if (!hasDb()) return [];
  // Results with nobody in them yet (a quiz not graded yet) aren't listed.
  const hasRows = sql`(jsonb_array_length(${examResults.rows}) > 0 or exists (select 1 from ${quizAttempts} qa where qa.tenant_id = ${examResults.tenantId} and qa.quiz_path = ${examResults.quizPath} and qa.env = ${env} and qa.approved_at is not null))`;
  return db().select({ id: examResults.id, title: examResults.title, date: examResults.date })
    .from(examResults).where(and(eq(examResults.tenantId, tenantId), eq(publishedIn(env), true), hasRows))
    .orderBy(desc(examResults.date), desc(examResults.id)).limit(30);
}

export type LookupResult = { title: string; date: string; total: string | null; name: string; score: string; note?: string } | null;

/** One student's result in a published exam, by name and phone; counts the lookup. */
export async function lookupResult(tenantId: string, env: SiteEnv, id: number, name: string, phone: string): Promise<LookupResult | "missing"> {
  const row = (await db().select({ title: examResults.title, date: examResults.date, total: examResults.total, rows: examResults.rows, quizPath: examResults.quizPath })
    .from(examResults).where(and(eq(examResults.tenantId, tenantId), eq(examResults.id, id), eq(publishedIn(env), true))).limit(1))[0];
  if (!row) return "missing";
  // The quiz's approved grades first: a grade from the teacher's review wins over an older typed row.
  const quizRows = row.quizPath ? await approvedRows(tenantId, row.quizPath, env) : [];
  const hit = findResult([...quizRows, ...cleanRows(row.rows as unknown[])], name, phone);
  const [lookups, found] = env === "preview" ? [examResults.previewLookups, examResults.previewFound] : [examResults.lookups, examResults.found];
  await db().update(examResults)
    .set({ [env === "preview" ? "previewLookups" : "lookups"]: sql`${lookups} + 1`, ...(hit ? { [env === "preview" ? "previewFound" : "found"]: sql`${found} + 1` } : {}) })
    .where(eq(examResults.id, id));
  if (!hit) return null;
  return { title: row.title, date: row.date, total: row.total, name: hit.name, score: hit.score, note: hit.note };
}
