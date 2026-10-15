import "server-only";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import type { SiteEnv } from "@/lib/environments";
import type { Content } from "@/lib/schema";
import { record } from "./analytics";

const { analyticsDaily, submissions, quizAttempts } = schema;

/**
 * Referral partners (content.referrals, part of the "promo" plan bundle):
 * - visits: counters from the page (api/v, "ref_view" / "ref_visitor" by code|page);
 * - votes: counters too ("ref_vote" by code|poll), since votes are anonymous;
 * - requests and quiz attempts: the code is saved on the row itself (submissions.ref,
 *   quiz_attempts.ref), so the teacher also sees which student came from whom.
 */

/** The codes and pages a visit can be counted for. */
export function refTargets(c: Content): { codes: ReadonlySet<string>; pages: ReadonlySet<string> } {
  return {
    codes: new Set(c.referrals.map((r) => r.code)),
    pages: new Set(["home", ...c.quizzes.map((q) => q.path), ...c.polls.map((p) => p.path)]),
  };
}

/** The partner code from a request body, when it's one of the site's partners. */
export function refOf(c: Content, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return c.referrals.some((r) => r.code === code) ? code : null;
}

export async function countRefVote(tenantId: string, env: SiteEnv, code: string, poll: string): Promise<void> {
  await record(tenantId, new Map([[`ref_vote\u0000${code}|${poll}`, 1]]), env);
}

/* ------------------------------------------------------------------ */
/* The admin report                                                    */
/* ------------------------------------------------------------------ */

export type Target = { kind: "home" | "quiz" | "poll" | "form"; id: string };
export type TargetStats = { views: number; visitors: number; actions: number; done?: number };
export type PartnerReport = {
  code: string;
  views: number;
  visitors: number;
  requests: number;
  quizzes: number;
  quizzesDone: number;
  votes: number;
  /** Per page or form: home, quiz:<path>, poll:<path>, form:<id>. */
  by: Map<string, TargetStats>;
};

/** Each partner's numbers between two Cairo days (from = null: since the start). */
export async function referralReport(tenantId: string, env: SiteEnv, c: Content, from: string | null, to: string): Promise<Map<string, PartnerReport>> {
  const codes = c.referrals.map((r) => r.code);
  const polls = new Set(c.polls.map((p) => p.path));
  const out = new Map<string, PartnerReport>(codes.map((code) => [code, { code, views: 0, visitors: 0, requests: 0, quizzes: 0, quizzesDone: 0, votes: 0, by: new Map() }]));
  if (!codes.length) return out;
  const stat = (code: string, target: string) => {
    const p = out.get(code)!;
    if (!p.by.has(target)) p.by.set(target, { views: 0, visitors: 0, actions: 0 });
    return p.by.get(target)!;
  };
  const d = db();
  // Cairo days to timestamps for the row tables: from the start of `from` to the end of `to`.
  const start = from ? new Date(`${from}T00:00:00+02:00`) : null;
  const end = new Date(new Date(`${to}T00:00:00+02:00`).getTime() + 26 * 3_600_000);

  const counters = await d
    .select({ metric: analyticsDaily.metric, key: analyticsDaily.key, value: sql<number>`sum(${analyticsDaily.value})::bigint` })
    .from(analyticsDaily)
    .where(and(eq(analyticsDaily.tenantId, tenantId), eq(analyticsDaily.env, env), inArray(analyticsDaily.metric, ["ref_view", "ref_visitor", "ref_vote"]),
      from ? gte(analyticsDaily.day, from) : undefined, lte(analyticsDaily.day, to)))
    .groupBy(analyticsDaily.metric, analyticsDaily.key);
  for (const r of counters) {
    const [code, page] = r.key.split("|");
    const p = out.get(code);
    if (!p) continue;
    const n = Number(r.value);
    if (r.metric === "ref_vote") { p.votes += n; stat(code, `poll:${page}`).actions += n; continue; }
    const target = page === "home" || page === "other" ? page : polls.has(page) ? `poll:${page}` : `quiz:${page}`;
    const s = stat(code, target);
    if (r.metric === "ref_view") { p.views += n; s.views += n; } else { p.visitors += n; s.visitors += n; }
  }

  const reqs = await d
    .select({ ref: submissions.ref, formId: submissions.formId, n: sql<number>`count(*)::int` })
    .from(submissions)
    .where(and(eq(submissions.tenantId, tenantId), eq(submissions.env, env), isNotNull(submissions.ref), inArray(submissions.ref, codes),
      start ? gte(submissions.createdAt, start) : undefined, lte(submissions.createdAt, end)))
    .groupBy(submissions.ref, submissions.formId);
  for (const r of reqs) {
    const p = out.get(r.ref!);
    if (!p) continue;
    p.requests += r.n;
    stat(p.code, `form:${r.formId}`).actions += r.n;
  }

  const attempts = await d
    .select({
      ref: quizAttempts.ref, path: quizAttempts.quizPath,
      n: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${quizAttempts.status} <> 'in_progress')::int`,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env), isNotNull(quizAttempts.ref), inArray(quizAttempts.ref, codes),
      start ? gte(quizAttempts.startedAt, start) : undefined, lte(quizAttempts.startedAt, end)))
    .groupBy(quizAttempts.ref, quizAttempts.quizPath);
  for (const r of attempts) {
    const p = out.get(r.ref!);
    if (!p) continue;
    p.quizzes += r.n;
    p.quizzesDone += r.done;
    const s = stat(p.code, `quiz:${r.path}`);
    s.actions += r.n;
    s.done = (s.done ?? 0) + r.done;
  }
  return out;
}

