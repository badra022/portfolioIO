import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { SiteEnv } from "@/lib/environments";
import { inProfile, type Content, type LeadFormT } from "@/lib/schema";
import { cleanRow, firstNameKey, isPhoneKey, percentOf, phoneKey, type ResultRow } from "@/lib/exam-results";
import { grade, studentOf } from "@/lib/quiz";

const { students, studentSync, submissions, quizAttempts, examResults, tenants } = schema;

/**
 * Student profiles: one per phone number (phoneKey), per teacher and environment.
 * They're filled from the student's requests (forms), quiz attempts and the exam
 * results the teacher entered, by syncing whatever is new since the last look
 * (syncStudents), so the public site's forms and quizzes don't change at all.
 * Profile fields: every form answer marked for the profile (schema inProfile),
 * latest answer wins; what the teacher types is never overwritten by a form.
 */

export type Trait = { label: string; value: string; at: string; by: "form" | "teacher" };
export type Traits = Record<string, Trait>;

export class StudentError extends Error {}

async function tenantIdOf(slug: string): Promise<string | null> {
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

/** The phone in a form's answers: the mobile field, else a field that looks like one. */
function phoneIn(form: LeadFormT | undefined, fields: Record<string, string>): string {
  const tel = form?.fields.find((f) => f.type === "tel")?.id;
  if (tel && fields[tel]) return fields[tel];
  const guess = Object.entries(fields).find(([k, v]) => /phone|mobile|tel|موبايل|رقم/i.test(k) && isPhoneKey(phoneKey(v)));
  return guess?.[1] ?? "";
}

/** Profile fields from a form's answers (not the name and phone, which are the profile's own). */
function traitsFrom(form: LeadFormT | undefined, fields: Record<string, string>, nameId: string | undefined, at: Date): Traits {
  const out: Traits = {};
  if (!form) return out;
  for (const f of form.fields) {
    const v = (fields[f.id] ?? "").trim();
    if (!v || f.type === "tel" || f.id === nameId || !inProfile(f)) continue;
    out[f.id] = { label: f.label, value: v.slice(0, 500), at: at.toISOString(), by: "form" };
  }
  return out;
}

const nameFieldId = (form: LeadFormT | undefined) => {
  const text = form?.fields.filter((f) => f.type === "text") ?? [];
  return form?.fields.find((f) => f.id === "name")?.id ?? text.find((f) => /name|اسم/i.test(`${f.id} ${f.label}`))?.id ?? text[0]?.id;
};

const words = (v: string) => v.trim().split(/\s+/).filter(Boolean).length;
/** A newer name replaces the profile's, unless the teacher set it or it's shorter ("منى" for "منى خالد محمود"). */
const betterName = (cur: { name: string; nameByTeacher: boolean; lastSeenAt: Date }, name: string, at: Date) =>
  !cur.nameByTeacher && Boolean(name.trim()) && (!cur.name || (at >= cur.lastSeenAt && words(name) >= words(cur.name)));

/** Creates or updates one profile from something the student did; returns its id. */
async function touch(tenantId: string, env: SiteEnv, phone: string, name: string, traits: Traits, at: Date, bumpSeen = true): Promise<number | null> {
  const key = phoneKey(phone);
  if (!isPhoneKey(key)) return null;
  const d = db();
  const cur = (await d.select().from(students).where(and(eq(students.tenantId, tenantId), eq(students.env, env), eq(students.phoneKey, key))).limit(1))[0];
  if (!cur) {
    const [row] = await d.insert(students).values({
      tenantId, env, phoneKey: key, phone: phone.trim().slice(0, 30), name: name.trim().slice(0, 120), traits,
      firstSeenAt: at, lastSeenAt: at,
    }).onConflictDoNothing().returning({ id: students.id });
    if (row) return row.id;
    return touch(tenantId, env, phone, name, traits, at, bumpSeen); // created meanwhile
  }
  const old = cur.traits as Traits;
  const merged: Traits = { ...old };
  for (const [k, t] of Object.entries(traits)) {
    // The teacher's own values stay; otherwise the latest answer wins.
    if (old[k]?.by === "teacher") continue;
    if (!old[k] || old[k].at <= t.at) merged[k] = t;
  }
  await d.update(students).set({
    name: betterName(cur, name, at) ? name.trim().slice(0, 120) : cur.name,
    traits: merged,
    firstSeenAt: at < cur.firstSeenAt ? at : cur.firstSeenAt,
    lastSeenAt: bumpSeen && at > cur.lastSeenAt ? at : cur.lastSeenAt,
  }).where(eq(students.id, cur.id));
  return cur.id;
}

/**
 * Brings profiles up to date: new requests and quiz attempts since the last sync
 * (they get their student's id), and students in the exam results typed or
 * imported by the teacher (production only; those don't change "last seen").
 */
export async function syncStudents(slug: string, env: SiteEnv, content: Content): Promise<void> {
  if (!hasDb()) return;
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) return;
  const d = db();
  await d.insert(studentSync).values({ tenantId, env }).onConflictDoNothing();
  const cursor = (await d.select().from(studentSync).where(and(eq(studentSync.tenantId, tenantId), eq(studentSync.env, env))).limit(1))[0];
  let lastSub = cursor.lastSubmission, lastAtt = cursor.lastAttempt;
  const formOf = (id: string | null | undefined) => content.forms.find((f) => f.id === id);

  for (;;) {
    const rows = await d.select({ id: submissions.id, formId: submissions.formId, fields: submissions.fields, createdAt: submissions.createdAt }).from(submissions)
      .where(and(eq(submissions.tenantId, tenantId), eq(submissions.env, env), gt(submissions.id, lastSub))).orderBy(asc(submissions.id)).limit(500);
    for (const r of rows) {
      const form = formOf(r.formId);
      const fields = r.fields as Record<string, string>;
      const phone = phoneIn(form, fields);
      const sid = phone ? await touch(tenantId, env, phone, studentOf(form, fields, null).name, traitsFrom(form, fields, nameFieldId(form), r.createdAt), r.createdAt) : null;
      if (sid) await d.update(submissions).set({ studentId: sid }).where(eq(submissions.id, r.id));
      lastSub = r.id;
    }
    if (rows.length < 500) break;
  }
  for (;;) {
    const rows = await d.select({ id: quizAttempts.id, quizPath: quizAttempts.quizPath, fields: quizAttempts.fields, contact: quizAttempts.contact, startedAt: quizAttempts.startedAt, finishedAt: quizAttempts.finishedAt })
      .from(quizAttempts).where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env), gt(quizAttempts.id, lastAtt))).orderBy(asc(quizAttempts.id)).limit(500);
    for (const r of rows) {
      const quiz = content.quizzes.find((q) => q.path === r.quizPath);
      const form = formOf(quiz?.form);
      const fields = r.fields as Record<string, string>;
      const phone = r.contact ?? phoneIn(form, fields);
      const at = r.finishedAt ?? r.startedAt;
      const sid = phone ? await touch(tenantId, env, phone, studentOf(form, fields, r.contact).name, traitsFrom(form, fields, nameFieldId(form), at), at) : null;
      if (sid) await d.update(quizAttempts).set({ studentId: sid }).where(eq(quizAttempts.id, r.id));
      lastAtt = r.id;
    }
    if (rows.length < 500) break;
  }
  if (lastSub !== cursor.lastSubmission || lastAtt !== cursor.lastAttempt) {
    await d.update(studentSync).set({ lastSubmission: lastSub, lastAttempt: lastAtt }).where(and(eq(studentSync.tenantId, tenantId), eq(studentSync.env, env)));
  }

  // Students only known from results the teacher entered (a paper exam): give them a profile too.
  if (env === "production") {
    const known = new Set((await d.select({ k: students.phoneKey }).from(students).where(and(eq(students.tenantId, tenantId), eq(students.env, env)))).map((r) => r.k));
    for (const set of await d.select({ rows: examResults.rows, date: examResults.date }).from(examResults).where(eq(examResults.tenantId, tenantId))) {
      for (const raw of set.rows as unknown[]) {
        const row = raw && typeof raw === "object" ? cleanRow(raw as Record<string, unknown>) : null;
        const key = row ? phoneKey(row.phone) : "";
        if (!row || !isPhoneKey(key) || known.has(key)) continue;
        known.add(key);
        await touch(tenantId, env, row.phone, row.name, {}, new Date(`${set.date}T12:00:00Z`), false);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** One point on the student's grades chart. */
export type GradePoint = { at: string; percent: number; title: string; kind: "quiz" | "exam"; score: string };

export type StudentStats = {
  requests: number;
  quizzes: number;
  finished: number;
  quizAvg: number | null;
  exams: number;
  examAvg: number | null;
  points: GradePoint[];
};

export type StudentSummary = {
  id: number; phone: string; name: string; traits: Traits; notes: string;
  firstSeenAt: string; lastSeenAt: string; stats: StudentStats;
};

type AttemptLite = { studentId: number | null; quizPath: string; answers: unknown; result: unknown; status: string; finishedAt: Date | null; startedAt: Date };
type ResultSetLite = { title: string; date: string; total: string | null; rows: ResultRow[] };

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Everything a profile's numbers need, for one teacher and environment. */
async function context(tenantId: string, env: SiteEnv) {
  const d = db();
  const [attempts, sets, reqCounts] = await Promise.all([
    d.select({ studentId: quizAttempts.studentId, quizPath: quizAttempts.quizPath, answers: quizAttempts.answers, result: quizAttempts.result, status: quizAttempts.status, finishedAt: quizAttempts.finishedAt, startedAt: quizAttempts.startedAt })
      .from(quizAttempts).where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env), isNotNull(quizAttempts.studentId))),
    d.select({ title: examResults.title, date: examResults.date, total: examResults.total, rows: examResults.rows, quizPath: examResults.quizPath })
      .from(examResults).where(eq(examResults.tenantId, tenantId)),
    d.select({ studentId: submissions.studentId, n: sql<number>`count(*)::int` }).from(submissions)
      .where(and(eq(submissions.tenantId, tenantId), eq(submissions.env, env), isNotNull(submissions.studentId))).groupBy(submissions.studentId),
  ]);
  return {
    attempts: attempts as AttemptLite[],
    // A quiz's results total (its full mark), for grading approved scores.
    quizTotals: new Map(sets.filter((s) => s.quizPath).map((s) => [s.quizPath!, s.total])),
    // Results the teacher entered (quiz grades are counted from the attempts themselves).
    manualSets: (env === "production" ? sets : []).map((s): ResultSetLite => ({
      title: s.title, date: s.date, total: s.total,
      rows: (s.rows as unknown[]).map((r) => (r && typeof r === "object" ? cleanRow(r as Record<string, unknown>) : null)).filter((r): r is ResultRow => r !== null),
    })),
    requests: new Map(reqCounts.map((r) => [r.studentId!, r.n])),
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function statsFor(ctx: Ctx, content: Content, s: { id: number; phoneKey: string; name: string }): StudentStats {
  const points: GradePoint[] = [];
  const mine = ctx.attempts.filter((a) => a.studentId === s.id);
  for (const a of mine) {
    if (a.status === "in_progress") continue;
    const quiz = content.quizzes.find((q) => q.path === a.quizPath);
    const r = a.result ? cleanRow(a.result as Record<string, unknown>) : null;
    // The teacher's grade when there is one, else the automatic score.
    let percent: number | null = null, score = "";
    if (r?.score) {
      const total = ctx.quizTotals.get(a.quizPath) ?? (quiz ? String(quiz.questions.reduce((x, q) => x + q.points, 0)) : null);
      percent = percentOf(r.score, total);
      score = total ? `${r.score}/${total}` : r.score;
    } else if (quiz) {
      const g = grade(quiz, a.answers as Record<string, string>);
      if (g.max) { percent = g.percent; score = `${g.score}/${g.max}`; }
    }
    if (percent !== null) points.push({ at: (a.finishedAt ?? a.startedAt).toISOString(), percent, title: quiz?.title ?? a.quizPath, kind: "quiz", score });
  }
  const first = firstNameKey(s.name);
  let exams = 0;
  for (const set of ctx.manualSets) {
    // Same phone, and the same first name when the profile has one (brothers can share a parent's phone).
    const row = set.rows.find((r) => phoneKey(r.phone) === s.phoneKey && (!first || !r.name || firstNameKey(r.name) === first));
    if (!row) continue;
    exams++;
    const p = percentOf(row.score, set.total);
    if (p !== null) points.push({ at: `${set.date}T12:00:00.000Z`, percent: p, title: set.title, kind: "exam", score: set.total ? `${row.score}/${set.total}` : row.score });
  }
  points.sort((a, b) => a.at.localeCompare(b.at));
  return {
    requests: ctx.requests.get(s.id) ?? 0,
    quizzes: mine.length,
    finished: mine.filter((a) => a.status !== "in_progress").length,
    quizAvg: avg(points.filter((p) => p.kind === "quiz").map((p) => p.percent)),
    exams,
    examAvg: avg(points.filter((p) => p.kind === "exam").map((p) => p.percent)),
    points,
  };
}

const summary = (ctx: Ctx, content: Content) => (r: typeof students.$inferSelect): StudentSummary => ({
  id: r.id, phone: r.phone, name: r.name, traits: r.traits as Traits, notes: r.notes,
  firstSeenAt: r.firstSeenAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(),
  stats: statsFor(ctx, content, r),
});

/** Every profile with its numbers, most recently active first. */
export async function listStudents(slug: string, env: SiteEnv, content: Content): Promise<StudentSummary[]> {
  if (!hasDb()) return [];
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) return [];
  const [rows, ctx] = await Promise.all([
    db().select().from(students).where(and(eq(students.tenantId, tenantId), eq(students.env, env))).orderBy(desc(students.lastSeenAt)).limit(20_000),
    context(tenantId, env),
  ]);
  return rows.map(summary(ctx, content));
}

export type StudentDetail = StudentSummary & {
  requests: { id: number; formId: string; formTitle: string; fields: { label: string; value: string }[]; createdAt: string }[];
  attempts: { id: number; quizPath: string; title: string; status: string; at: string; grade: string | null; note: string | null; approved: boolean }[];
};

export async function getStudent(slug: string, env: SiteEnv, content: Content, id: number): Promise<StudentDetail | null> {
  if (!hasDb() || !Number.isInteger(id)) return null;
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) return null;
  const d = db();
  const row = (await d.select().from(students).where(and(eq(students.tenantId, tenantId), eq(students.env, env), eq(students.id, id))).limit(1))[0];
  if (!row) return null;
  const [ctx, reqs, atts] = await Promise.all([
    context(tenantId, env),
    d.select().from(submissions).where(and(eq(submissions.tenantId, tenantId), eq(submissions.studentId, id))).orderBy(desc(submissions.createdAt)).limit(200),
    d.select().from(quizAttempts).where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.studentId, id))).orderBy(desc(quizAttempts.startedAt)).limit(200),
  ]);
  const base = summary(ctx, content)(row);
  return {
    ...base,
    requests: reqs.map((r) => {
      const form = content.forms.find((f) => f.id === r.formId);
      const fields = r.fields as Record<string, string>;
      return {
        id: r.id, formId: r.formId, formTitle: form?.title ?? r.formId, createdAt: r.createdAt.toISOString(),
        fields: [
          ...Object.entries(fields).map(([k, v]) => ({ label: form?.fields.find((f) => f.id === k)?.label ?? k, value: v })),
          ...Object.entries(r.context as Record<string, string>).map(([k, v]) => ({ label: k, value: v })),
        ],
      };
    }),
    attempts: atts.map((a) => {
      const point = base.stats.points.find((p) => p.kind === "quiz" && p.at === (a.finishedAt ?? a.startedAt).toISOString());
      const r = a.result ? cleanRow(a.result as Record<string, unknown>) : null;
      return {
        id: a.id, quizPath: a.quizPath, title: content.quizzes.find((q) => q.path === a.quizPath)?.title ?? a.quizPath,
        status: a.status, at: (a.finishedAt ?? a.startedAt).toISOString(),
        grade: point ? `${point.score} (${point.percent}%)` : null, note: r?.note ?? null, approved: Boolean(a.approvedAt),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* The teacher's edits                                                 */
/* ------------------------------------------------------------------ */

/** Name, profile fields (the full list as edited) and notes. Values the teacher changes or adds become theirs. */
export async function updateStudent(slug: string, env: SiteEnv, id: number, input: { name: string; traits: { key: string; label: string; value: string }[]; notes: string }): Promise<void> {
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) throw new StudentError("المدرس مش موجود.");
  const d = db();
  const cur = (await d.select().from(students).where(and(eq(students.tenantId, tenantId), eq(students.env, env), eq(students.id, id))).limit(1))[0];
  if (!cur) throw new StudentError("الطالب مش موجود.");
  const old = cur.traits as Traits;
  const traits: Traits = {};
  const now = new Date().toISOString();
  for (const t of input.traits.slice(0, 60)) {
    const label = String(t.label ?? "").trim().slice(0, 60);
    const value = String(t.value ?? "").trim().slice(0, 500);
    if (!label || !value) continue;
    const key = /^[\w-]{1,40}$/.test(t.key) ? t.key : `t_${Math.random().toString(36).slice(2, 9)}`;
    const prev = old[key];
    traits[key] = prev && prev.value === value && prev.label === label ? prev : { label, value, at: now, by: "teacher" };
  }
  const name = String(input.name ?? "").trim().slice(0, 120);
  await d.update(students).set({
    name, nameByTeacher: cur.nameByTeacher || name !== cur.name, traits,
    notes: String(input.notes ?? "").slice(0, 4000), updatedAt: new Date(),
  }).where(eq(students.id, id));
}

/** A student the teacher adds by hand (e.g. from a paper list). Returns the profile id. */
export async function createStudent(slug: string, env: SiteEnv, name: string, phone: string): Promise<number> {
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) throw new StudentError("المدرس مش موجود.");
  if (!isPhoneKey(phoneKey(phone))) throw new StudentError("اكتب رقم موبايل صحيح.");
  if (!name.trim()) throw new StudentError("اكتب اسم الطالب.");
  const id = await touch(tenantId, env, phone, name, {}, new Date());
  if (!id) throw new StudentError("اكتب رقم موبايل صحيح.");
  await db().update(students).set({ nameByTeacher: true, name: name.trim().slice(0, 120) }).where(eq(students.id, id));
  return id;
}

/** Removes a profile (its requests and quizzes stay; they're just no longer linked). */
export async function deleteStudent(slug: string, env: SiteEnv, id: number): Promise<void> {
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) return;
  const d = db();
  await d.update(submissions).set({ studentId: null }).where(and(eq(submissions.tenantId, tenantId), eq(submissions.studentId, id)));
  await d.update(quizAttempts).set({ studentId: null }).where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.studentId, id)));
  await d.delete(students).where(and(eq(students.tenantId, tenantId), eq(students.env, env), eq(students.id, id)));
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

/** Every profile as an Excel-ready CSV: identity, every profile field, notes and the numbers. */
export function studentsCsv(list: StudentSummary[]): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(iso));
  // One column per profile field label, in order of first appearance.
  const labels: string[] = [];
  for (const s of list) for (const t of Object.values(s.traits)) if (!labels.includes(t.label)) labels.push(t.label);
  const head = ["الاسم", "الموبايل", ...labels, "ملاحظات", "طلبات", "اختبارات", "متوسط الاختبارات %", "امتحانات", "متوسط الامتحانات %", "أول ظهور", "آخر نشاط"];
  const lines = list.map((s) => {
    const byLabel = new Map(Object.values(s.traits).map((t) => [t.label, t.value]));
    return [
      cell(s.name), /^\+?\d{8,15}$/.test(s.phone) ? `"=""${s.phone}"""` : cell(s.phone),
      ...labels.map((l) => cell(byLabel.get(l) ?? "")),
      cell(s.notes), String(s.stats.requests), String(s.stats.finished), s.stats.quizAvg === null ? "" : String(s.stats.quizAvg),
      String(s.stats.exams), s.stats.examAvg === null ? "" : String(s.stats.examAvg), day(s.firstSeenAt), day(s.lastSeenAt),
    ].join(",");
  });
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}

/** Profile ids for a list of phone numbers (to link from other admin pages). */
export async function idsByPhone(slug: string, env: SiteEnv, phones: string[]): Promise<Map<string, number>> {
  const keys = [...new Set(phones.map(phoneKey).filter(isPhoneKey))];
  if (!hasDb() || !keys.length) return new Map();
  const tenantId = await tenantIdOf(slug);
  if (!tenantId) return new Map();
  const rows = await db().select({ id: students.id, k: students.phoneKey }).from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.env, env), inArray(students.phoneKey, keys)));
  return new Map(rows.map((r) => [r.k, r.id]));
}
