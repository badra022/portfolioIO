import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { DATE_RE } from "@/lib/dates";
import { MAX_ROWS, cleanRow, findResult, mergeRows, type MergeSummary, type ResultRow } from "@/lib/exam-results";

const { examResults, tenants } = schema;

/** One exam's results as the admin sees them (without the rows). */
export type ResultSetInfo = {
  id: number;
  examId: string | null;
  title: string;
  date: string;
  total: string | null;
  published: boolean;
  count: number;
  lookups: number;
  found: number;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};
export type ResultSet = ResultSetInfo & { rows: ResultRow[] };

/** What the site shows: a published exam students can look their result up in. */
export type PastExam = { id: number; title: string; date: string };

export class ResultsError extends Error {}

async function tenantIdOf(slug: string): Promise<string> {
  const id = (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id;
  if (!id) throw new ResultsError("Teacher not found.");
  return id;
}

const info = {
  id: examResults.id, examId: examResults.examId, title: examResults.title, date: examResults.date, total: examResults.total,
  published: examResults.published, count: sql<number>`jsonb_array_length(${examResults.rows})`.mapWith(Number),
  lookups: examResults.lookups, found: examResults.found, version: examResults.version,
  updatedAt: examResults.updatedAt, updatedBy: examResults.updatedBy,
};
const toInfo = <T extends { updatedAt: Date }>(r: T) => ({ ...r, updatedAt: r.updatedAt.toISOString() });

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

export async function getResultSet(slug: string, id: number): Promise<ResultSet | null> {
  if (!hasDb() || !Number.isInteger(id)) return null;
  const row = (await db().select({ ...info, rows: examResults.rows }).from(examResults).innerJoin(tenants, eq(tenants.id, examResults.tenantId))
    .where(and(eq(tenants.slug, slug), eq(examResults.id, id))).limit(1))[0];
  return row ? { ...toInfo(row), rows: cleanRows(row.rows as unknown[]) } : null;
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

export async function updateResultMeta(slug: string, id: number, m: { title?: unknown; date?: unknown; total?: unknown; published?: boolean }, author: string): Promise<void> {
  const current = await getResultSet(slug, id);
  if (!current) throw new ResultsError("الامتحان مش موجود.");
  const meta = cleanMeta({ title: m.title ?? current.title, date: m.date ?? current.date, total: m.total === undefined ? current.total : m.total });
  await update({ slug, id }, { ...meta, published: m.published ?? current.published }, author);
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
  await db().delete(examResults).where(and(eq(examResults.tenantId, tenantId), eq(examResults.id, id)));
}

/* ------------------------------------------------------------------ */
/* Site                                                                */
/* ------------------------------------------------------------------ */

/** Published exams, newest first, for the exams section. Cached with the teacher's page (site.ts). */
export async function publishedExams(tenantId: string): Promise<PastExam[]> {
  if (!hasDb()) return [];
  return db().select({ id: examResults.id, title: examResults.title, date: examResults.date })
    .from(examResults).where(and(eq(examResults.tenantId, tenantId), eq(examResults.published, true)))
    .orderBy(desc(examResults.date), desc(examResults.id)).limit(30);
}

export type LookupResult = { title: string; date: string; total: string | null; name: string; score: string; note?: string } | null;

/** One student's result in a published exam, by name and phone; counts the lookup. */
export async function lookupResult(tenantId: string, id: number, name: string, phone: string): Promise<LookupResult | "missing"> {
  const row = (await db().select({ title: examResults.title, date: examResults.date, total: examResults.total, rows: examResults.rows })
    .from(examResults).where(and(eq(examResults.tenantId, tenantId), eq(examResults.id, id), eq(examResults.published, true))).limit(1))[0];
  if (!row) return "missing";
  const hit = findResult(cleanRows(row.rows as unknown[]), name, phone);
  await db().update(examResults)
    .set({ lookups: sql`${examResults.lookups} + 1`, found: hit ? sql`${examResults.found} + 1` : examResults.found })
    .where(eq(examResults.id, id));
  if (!hit) return null;
  return { title: row.title, date: row.date, total: row.total, name: hit.name, score: hit.score, note: hit.note };
}
