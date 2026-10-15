import "server-only";
import type { SiteEnv } from "@/lib/environments";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { LeadFormT, QuizT } from "@/lib/schema";
import { attemptDeadline, availability, grade, publicQuestions, studentOf, type Graded, type PublicQuestion } from "@/lib/quiz";
import { cleanRow, type ResultRow } from "@/lib/exam-results";
import { blockedMessage } from "@/lib/permissions";
import { getTenant } from "./repo";
import { checkAnswers, normalizePhone } from "./submissions";
import { ui } from "@/lib/i18n";

const { quizAttempts, tenants } = schema;

/** Network slack after the deadline: answers sent within it still count as on time. */
const GRACE_MS = 20_000;
const MAX_ANSWER = 2000;

export type AttemptState = {
  token: string;
  status: "in_progress" | "submitted" | "timed_out";
  questions: PublicQuestion[];
  answers: Record<string, string>;
  /** ms since epoch, or null (no timer). */
  deadline: number | null;
  /** The server's clock, so the browser's countdown doesn't depend on the phone's time. */
  now: number;
};

type Row = typeof quizAttempts.$inferSelect;

const stateOf = (r: Row): AttemptState => ({
  token: r.token,
  status: r.status as AttemptState["status"],
  questions: r.questions as PublicQuestion[],
  answers: r.answers as Record<string, string>,
  deadline: r.deadlineAt?.getTime() ?? null,
  now: Date.now(),
});

/** Keeps only answers to existing questions, as strings, capped. No other checks: any answer (or none) is fine. */
function cleanAnswers(raw: unknown, count: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= count || typeof v !== "string") continue;
    out[String(i)] = v.slice(0, MAX_ANSWER);
  }
  return out;
}

/** True when the attempt can no longer change: past its deadline (plus grace) or the quiz was closed. */
const expired = (r: Row, quiz: QuizT | undefined, now = Date.now()) =>
  !quiz || quiz.state === "closed" || (r.deadlineAt !== null && now > r.deadlineAt.getTime() + GRACE_MS);

async function finishTimedOut(r: Row): Promise<Row> {
  const [u] = await db().update(quizAttempts)
    .set({ status: "timed_out", finishedAt: r.deadlineAt && r.deadlineAt.getTime() < Date.now() ? r.deadlineAt : new Date() })
    .where(and(eq(quizAttempts.id, r.id), eq(quizAttempts.status, "in_progress")))
    .returning();
  return u ?? r;
}

export type StartResult =
  | { ok: true; attempt: AttemptState; resumed: boolean }
  | { ok: false; error: string; errors?: Record<string, string> };

/**
 * Starts an attempt after the quiz's form is filled. With a mobile number on the
 * form, the same number gets its existing attempt back (continue, or "already
 * submitted") instead of a new one, on any device.
 */
export async function startAttempt(tenantId: string, env: SiteEnv, quiz: QuizT, form: LeadFormT | undefined, values: Record<string, string>, locale?: string): Promise<StartResult> {
  let fields: Record<string, string> = {};
  if (form) {
    const checked = checkAnswers(form, values, ui(locale));
    if (!checked.ok) return { ok: false, error: "invalid", errors: checked.errors };
    fields = checked.fields;
  }
  const phoneField = form?.fields.find((f) => f.type === "tel");
  const contact = phoneField && fields[phoneField.id] ? normalizePhone(fields[phoneField.id]).replace(/^\+?20(?=1\d{9}$)/, "0") : null;
  const d = db();
  if (contact) {
    const existing = (await d.select().from(quizAttempts)
      .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env), eq(quizAttempts.quizPath, quiz.path), eq(quizAttempts.contact, contact))).limit(1))[0];
    if (existing) {
      const r = existing.status === "in_progress" && expired(existing, quiz) ? await finishTimedOut(existing) : existing;
      return { ok: true, attempt: stateOf(r), resumed: true };
    }
  }
  const a = availability(quiz);
  if (!a.open) return { ok: false, error: a.reason };
  const now = Date.now();
  const deadline = attemptDeadline(quiz, now);
  const [row] = await d.insert(quizAttempts).values({
    tenantId, env, quizPath: quiz.path, token: randomBytes(24).toString("base64url"), contact,
    fields, answers: {}, questions: publicQuestions(quiz),
    startedAt: new Date(now), deadlineAt: deadline === null ? null : new Date(deadline),
  }).onConflictDoNothing().returning();
  if (!row) return startAttempt(tenantId, env, quiz, form, values, locale); // the same number started at the same moment: resume it
  return { ok: true, attempt: stateOf(row), resumed: false };
}

async function byToken(tenantId: string, token: unknown): Promise<Row | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 64) return null;
  return (await db().select().from(quizAttempts).where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.token, token))).limit(1))[0] ?? null;
}

/** Where an attempt stands (after a refresh). Ends it first if its time ran out. */
export async function resumeAttempt(tenantId: string, quizzes: QuizT[], token: unknown): Promise<AttemptState | null> {
  const r = await byToken(tenantId, token);
  if (!r) return null;
  const quiz = quizzes.find((q) => q.path === r.quizPath);
  return stateOf(r.status === "in_progress" && expired(r, quiz) ? await finishTimedOut(r) : r);
}

/**
 * Saves answers while the student works (autosave), or hands them in (final).
 * Too late: the last saved answers stand and the attempt is marked timed out.
 */
export async function saveAnswers(tenantId: string, quizzes: QuizT[], token: unknown, raw: unknown, final: boolean): Promise<AttemptState | null> {
  const r = await byToken(tenantId, token);
  if (!r) return null;
  if (r.status !== "in_progress") return stateOf(r);
  const quiz = quizzes.find((q) => q.path === r.quizPath);
  if (expired(r, quiz)) return stateOf(await finishTimedOut(r));
  const answers = cleanAnswers(raw, (r.questions as unknown[]).length);
  const timedOut = r.deadlineAt !== null && Date.now() > r.deadlineAt.getTime();
  const [u] = await db().update(quizAttempts)
    .set(final ? { answers, status: timedOut ? "timed_out" : "submitted", finishedAt: new Date() } : { answers })
    .where(and(eq(quizAttempts.id, r.id), eq(quizAttempts.status, "in_progress")))
    .returning();
  return stateOf(u ?? r);
}

/* ------------------------------------------------------------------ */
/* Results (admin)                                                     */
/* ------------------------------------------------------------------ */

export type AttemptRow = {
  id: number;
  status: AttemptState["status"];
  fields: Record<string, string>;
  answers: Record<string, string>;
  questions: PublicQuestion[];
  startedAt: string;
  finishedAt: string | null;
  /** Seconds from start to hand-in (finished attempts). */
  seconds: number | null;
  graded: Graded;
  /** The teacher's grade (a draft until approved), or null when not graded yet. */
  result: ResultRow | null;
  /** When the grade was approved (students can look it up), or null. */
  approvedAt: string | null;
  reviewedBy: string | null;
  /** Name and phone from the student's form, for a new grade. */
  student: { name: string; phone: string };
};

async function tenantIdOf(slug: string): Promise<string | null> {
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id ?? null;
}

/** Marks attempts whose time is up as timed out (nobody came back to hand them in). */
async function closeExpired(tenantId: string, quiz: QuizT): Promise<void> {
  const base = and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.quizPath, quiz.path), eq(quizAttempts.status, "in_progress"));
  if (quiz.state === "closed") {
    await db().update(quizAttempts).set({ status: "timed_out", finishedAt: new Date() }).where(base);
    return;
  }
  await db().update(quizAttempts).set({ status: "timed_out", finishedAt: sql`${quizAttempts.deadlineAt}` })
    .where(and(base, isNotNull(quizAttempts.deadlineAt), lt(quizAttempts.deadlineAt, new Date(Date.now() - GRACE_MS))));
}

export async function listAttempts(slug: string, quiz: QuizT, env: SiteEnv = "production", form?: LeadFormT): Promise<AttemptRow[]> {
  if (!hasDb()) return [];
  const id = await tenantIdOf(slug);
  if (!id) return [];
  await closeExpired(id, quiz);
  const rows = await db().select().from(quizAttempts)
    .where(and(eq(quizAttempts.tenantId, id), eq(quizAttempts.env, env), eq(quizAttempts.quizPath, quiz.path)))
    .orderBy(desc(quizAttempts.startedAt)).limit(5000);
  return rows.map((r) => ({
    id: r.id,
    status: r.status as AttemptState["status"],
    fields: r.fields as Record<string, string>,
    answers: r.answers as Record<string, string>,
    questions: r.questions as PublicQuestion[],
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    seconds: r.finishedAt ? Math.max(0, Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)) : null,
    graded: grade(quiz, r.answers as Record<string, string>),
    result: r.result ? cleanRow(r.result as Record<string, unknown>) : null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    reviewedBy: r.reviewedBy,
    student: studentOf(form, r.fields as Record<string, string>, r.contact),
  }));
}

/* ------------------------------------------------------------------ */
/* Grading (admin)                                                     */
/* ------------------------------------------------------------------ */

export class GradeError extends Error {}

/**
 * The teacher's grade and comment on one finished attempt. Approved grades are
 * part of the quiz's exam results right away (lib/server/exam-results.ts);
 * approved = false keeps it as a draft (or takes an approved grade back).
 */
export async function reviewAttempt(slug: string, quizPath: string, id: number, input: { name?: unknown; phone?: unknown; score?: unknown; note?: unknown }, approved: boolean, author: string): Promise<void> {
  if ((await getTenant(slug))?.permissions.exams === false) throw new GradeError(blockedMessage("exams"));
  const tenantId = await tenantIdOf(slug);
  if (!tenantId || !Number.isInteger(id)) throw new GradeError("الطالب مش موجود.");
  const row = cleanRow({ name: input.name, phone: input.phone, score: input.score, note: input.note });
  if (!row?.name) throw new GradeError("اكتب اسم الطالب.");
  if (approved && !row.score) throw new GradeError("اكتب الدرجة قبل الاعتماد.");
  const [u] = await db().update(quizAttempts)
    .set({ result: row, approvedAt: approved ? sql`coalesce(${quizAttempts.approvedAt}, now())` : null, reviewedAt: new Date(), reviewedBy: author })
    .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.quizPath, quizPath), eq(quizAttempts.id, id), sql`${quizAttempts.status} <> 'in_progress'`))
    .returning({ id: quizAttempts.id });
  if (!u) throw new GradeError("الطالب لسه بيحل، أو المحاولة اتمسحت.");
}

/**
 * Approves every finished attempt that isn't approved yet with the automatic
 * score (or the teacher's draft grade, when there is one). Returns how many.
 */
export async function approveAll(slug: string, quiz: QuizT, env: SiteEnv, form: LeadFormT | undefined, author: string): Promise<number> {
  if ((await getTenant(slug))?.permissions.exams === false) throw new GradeError(blockedMessage("exams"));
  const rows = (await listAttempts(slug, quiz, env, form)).filter((r) => r.status !== "in_progress" && !r.approvedAt);
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) return 0;
  let n = 0;
  for (const r of rows) {
    const score = r.result?.score || (r.graded.max ? String(r.graded.score) : "");
    const result = cleanRow({ name: r.result?.name || r.student.name, phone: r.result?.phone || r.student.phone, score, note: r.result?.note });
    if (!result?.name || !result.score) continue;
    await db().update(quizAttempts).set({ result, approvedAt: new Date(), reviewedAt: new Date(), reviewedBy: author })
      .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.id, r.id), sql`${quizAttempts.approvedAt} is null`));
    n++;
  }
  return n;
}

/** Approved grades of a quiz as result rows, for the quiz's exam results. */
export async function approvedRows(tenantId: string, quizPath: string, env: SiteEnv): Promise<ResultRow[]> {
  const rows = await db().select({ result: quizAttempts.result }).from(quizAttempts)
    .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env), eq(quizAttempts.quizPath, quizPath), isNotNull(quizAttempts.approvedAt)))
    .orderBy(desc(quizAttempts.approvedAt));
  return rows.map((r) => (r.result ? cleanRow(r.result as Record<string, unknown>) : null)).filter((r): r is ResultRow => r !== null);
}

/** Attempt counts per quiz path, for the admin overview. */
export async function attemptCounts(slug: string, env: SiteEnv = "production"): Promise<Record<string, { total: number; finished: number }>> {
  if (!hasDb()) return {};
  const id = await tenantIdOf(slug);
  if (!id) return {};
  const rows = await db().select({
    path: quizAttempts.quizPath,
    total: sql<number>`count(*)::int`,
    finished: sql<number>`count(*) filter (where ${quizAttempts.status} <> 'in_progress')::int`,
  }).from(quizAttempts).where(and(eq(quizAttempts.tenantId, id), eq(quizAttempts.env, env))).groupBy(quizAttempts.quizPath);
  return Object.fromEntries(rows.map((r) => [r.path, { total: r.total, finished: r.finished }]));
}

export async function deleteAttempts(slug: string, quizPath: string, ids: number[]): Promise<void> {
  const id = await tenantIdOf(slug);
  if (!id || !ids.length) return;
  await db().delete(quizAttempts).where(and(eq(quizAttempts.tenantId, id), eq(quizAttempts.quizPath, quizPath), inArray(quizAttempts.id, ids)));
}

export type QuizMetrics = {
  started: number;
  submitted: number;
  timedOut: number;
  inProgress: number;
  /** Finished / started, %. */
  completion: number;
  graded: boolean;
  avgPercent: number | null;
  medianPercent: number | null;
  topPercent: number | null;
  passRate: number | null;
  avgSeconds: number | null;
  /** Finished attempts per score band (0-19, 20-39, ... 80-100). */
  bands: { key: string; value: number }[];
  questions: { index: number; text: string; answered: number; correctRate: number | null; topWrong: { answer: string; count: number }[] }[];
};

/** The quiz's numbers, over finished attempts (submitted or timed out). */
export function quizMetrics(quiz: QuizT, rows: AttemptRow[]): QuizMetrics {
  const finished = rows.filter((r) => r.status !== "in_progress");
  const pct = finished.map((r) => r.graded.percent).filter((p): p is number => p !== null).sort((a, b) => a - b);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const times = finished.map((r) => r.seconds).filter((s): s is number => s !== null);
  const bands = ["0-19", "20-39", "40-59", "60-79", "80-100"].map((key, i) => ({
    key, value: pct.filter((p) => (i === 4 ? p >= 80 : p >= i * 20 && p < i * 20 + 20)).length,
  }));
  return {
    started: rows.length,
    submitted: rows.filter((r) => r.status === "submitted").length,
    timedOut: rows.filter((r) => r.status === "timed_out").length,
    inProgress: rows.filter((r) => r.status === "in_progress").length,
    completion: rows.length ? Math.round((finished.length / rows.length) * 100) : 0,
    graded: quiz.questions.some((q) => q.correct.length > 0),
    avgPercent: avg(pct),
    medianPercent: pct.length ? pct[Math.floor((pct.length - 1) / 2)] : null,
    topPercent: pct.length ? pct[pct.length - 1] : null,
    passRate: pct.length ? Math.round((pct.filter((p) => p >= quiz.passPercent).length / pct.length) * 100) : null,
    avgSeconds: avg(times),
    bands,
    questions: quiz.questions.map((q, i) => {
      const answered = finished.filter((r) => (r.answers[String(i)] ?? "").trim() !== "");
      const marks = finished.map((r) => r.graded.marks[i]).filter((m): m is boolean => m !== null && m !== undefined);
      const wrong = new Map<string, number>();
      for (const r of finished) if (r.graded.marks[i] === false) {
        const a = (r.answers[String(i)] ?? "").trim();
        if (a) wrong.set(a, (wrong.get(a) ?? 0) + 1);
      }
      return {
        index: i,
        text: q.text?.trim() || `سؤال ${i + 1}`,
        answered: finished.length ? Math.round((answered.length / finished.length) * 100) : 0,
        correctRate: marks.length ? Math.round((marks.filter(Boolean).length / marks.length) * 100) : null,
        topWrong: [...wrong].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([answer, count]) => ({ answer, count })),
      };
    }),
  };
}

/** CSV (Excel-ready, like the requests export): one row per attempt, one column per question plus ✓/✗. */
export function attemptsCsv(quiz: QuizT, form: LeadFormT | undefined, rows: AttemptRow[]): string {
  const fieldIds = form ? form.fields.map((f) => f.id) : [...new Set(rows.flatMap((r) => Object.keys(r.fields)))];
  const label = (id: string) => form?.fields.find((f) => f.id === id)?.label ?? id;
  const tel = new Set(form?.fields.filter((f) => f.type === "tel").map((f) => f.id) ?? []);
  const STATUS: Record<string, string> = { in_progress: "لم يسلّم بعد", submitted: "سلّم", timed_out: "انتهى الوقت" };
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(",", "") : "");
  const head = [...fieldIds.map(label), "الحالة", "الدرجة", "من", "النسبة %", "درجة المدرس", "تعليق المدرس", "معتمدة", "بدأ", "سلّم", "المدة (دقيقة)",
    ...quiz.questions.flatMap((q, i) => [`س${i + 1}${q.text ? `: ${q.text.slice(0, 40)}` : ""}`, `س${i + 1} ✓`])];
  const lines = rows.map((r) => [
    ...fieldIds.map((id) => {
      const v = r.fields[id] ?? "";
      return tel.has(id) && /^\+?\d{8,15}$/.test(v) ? `"=""${v}"""` : cell(v);
    }),
    cell(STATUS[r.status]), String(r.graded.max ? r.graded.score : ""), String(r.graded.max || ""), r.graded.percent === null ? "" : String(r.graded.percent),
    cell(r.result?.score ?? ""), cell(r.result?.note ?? ""), r.approvedAt ? "✓" : "",
    cell(when(r.startedAt)), cell(when(r.finishedAt)), r.seconds === null ? "" : String(Math.round(r.seconds / 6) / 10),
    ...quiz.questions.flatMap((_, i) => [cell(r.answers[String(i)] ?? ""), r.graded.marks[i] === null ? "" : r.graded.marks[i] ? "✓" : "✗"]),
  ].join(","));
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
