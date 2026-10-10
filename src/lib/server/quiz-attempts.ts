import "server-only";
import type { SiteEnv } from "@/lib/environments";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { LeadFormT, QuizT } from "@/lib/schema";
import { attemptDeadline, availability, grade, publicQuestions, type Graded, type PublicQuestion } from "@/lib/quiz";
import { checkAnswers, normalizePhone } from "./submissions";

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
export async function startAttempt(tenantId: string, env: SiteEnv, quiz: QuizT, form: LeadFormT | undefined, values: Record<string, string>): Promise<StartResult> {
  let fields: Record<string, string> = {};
  if (form) {
    const checked = checkAnswers(form, values);
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
  if (!row) return startAttempt(tenantId, env, quiz, form, values); // the same number started at the same moment: resume it
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

export async function listAttempts(slug: string, quiz: QuizT, env: SiteEnv = "production"): Promise<AttemptRow[]> {
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
  }));
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
  const head = [...fieldIds.map(label), "الحالة", "الدرجة", "من", "النسبة %", "بدأ", "سلّم", "المدة (دقيقة)",
    ...quiz.questions.flatMap((q, i) => [`س${i + 1}${q.text ? `: ${q.text.slice(0, 40)}` : ""}`, `س${i + 1} ✓`])];
  const lines = rows.map((r) => [
    ...fieldIds.map((id) => {
      const v = r.fields[id] ?? "";
      return tel.has(id) && /^\+?\d{8,15}$/.test(v) ? `"=""${v}"""` : cell(v);
    }),
    cell(STATUS[r.status]), String(r.graded.max ? r.graded.score : ""), String(r.graded.max || ""), r.graded.percent === null ? "" : String(r.graded.percent),
    cell(when(r.startedAt)), cell(when(r.finishedAt)), r.seconds === null ? "" : String(Math.round(r.seconds / 6) / 10),
    ...quiz.questions.flatMap((_, i) => [cell(r.answers[String(i)] ?? ""), r.graded.marks[i] === null ? "" : r.graded.marks[i] ? "✓" : "✗"]),
  ].join(","));
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
