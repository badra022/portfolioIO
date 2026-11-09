import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { SiteEnv } from "@/lib/environments";
import { cairoDay } from "@/lib/analytics";
import { activeTenantId } from "./analytics";

const { analyticsDaily, quizAttempts } = schema;

/**
 * Counters behind the content library (lib/library.ts): page views per article, game
 * and quiz (analytics_daily, metric page_view, keys "a:<path>", "g:<path>", "q:<path>",
 * plays "gp:<path>"), and how many students took each quiz (quiz_attempts).
 */

/** All-time totals for some page_view keys. */
export async function viewTotals(slug: string, env: SiteEnv, keys: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!hasDb() || !keys.length) return out;
  const tenantId = await activeTenantId(slug);
  if (!tenantId) return out;
  const rows = await db().select({ key: analyticsDaily.key, n: sql<number>`sum(${analyticsDaily.value})::int` }).from(analyticsDaily)
    .where(and(eq(analyticsDaily.tenantId, tenantId), eq(analyticsDaily.env, env), eq(analyticsDaily.metric, "page_view"), inArray(analyticsDaily.key, keys.slice(0, 500))))
    .groupBy(analyticsDaily.key);
  for (const r of rows) out[r.key] = r.n;
  return out;
}

/** Students who started each quiz (one per attempt), by quiz path. */
export async function takerTotals(slug: string, env: SiteEnv): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!hasDb()) return out;
  const tenantId = await activeTenantId(slug);
  if (!tenantId) return out;
  const rows = await db().select({ path: quizAttempts.quizPath, n: sql<number>`count(*)::int` }).from(quizAttempts)
    .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env)))
    .groupBy(quizAttempts.quizPath);
  for (const r of rows) out[r.path] = r.n;
  return out;
}

export type DayPoint = { day: string; views: number; second: number };

/**
 * One item's day-by-day numbers between two Cairo days (inclusive): views, plus a
 * second series (plays for a game, students who started for a quiz).
 */
export async function itemSeries(slug: string, env: SiteEnv, kind: "article" | "game" | "quiz", path: string, from: string, to: string): Promise<DayPoint[]> {
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); cairoDay(d) <= to; d = new Date(d.getTime() + 86_400_000)) days.push(cairoDay(d));
  const points = new Map(days.map((day) => [day, { day, views: 0, second: 0 }]));
  if (!hasDb()) return [...points.values()];
  const tenantId = await activeTenantId(slug);
  if (!tenantId) return [...points.values()];
  const viewKey = `${kind === "article" ? "a" : kind === "game" ? "g" : "q"}:${path}`;
  const keys = kind === "game" ? [viewKey, `gp:${path}`] : [viewKey];
  const rows = await db().select({ day: analyticsDaily.day, key: analyticsDaily.key, n: sql<number>`sum(${analyticsDaily.value})::int` }).from(analyticsDaily)
    .where(and(eq(analyticsDaily.tenantId, tenantId), eq(analyticsDaily.env, env), eq(analyticsDaily.metric, "page_view"), inArray(analyticsDaily.key, keys), gte(analyticsDaily.day, from), lte(analyticsDaily.day, to)))
    .groupBy(analyticsDaily.day, analyticsDaily.key);
  for (const r of rows) {
    const p = points.get(String(r.day));
    if (!p) continue;
    if (r.key === viewKey) p.views += r.n; else p.second += r.n;
  }
  if (kind === "quiz") {
    const day = sql<string>`to_char(${quizAttempts.startedAt} at time zone 'Africa/Cairo', 'YYYY-MM-DD')`;
    const started = await db().select({ day, n: sql<number>`count(*)::int` }).from(quizAttempts)
      .where(and(eq(quizAttempts.tenantId, tenantId), eq(quizAttempts.env, env), eq(quizAttempts.quizPath, path),
        gte(quizAttempts.startedAt, new Date(`${from}T00:00:00+02:00`)), lte(quizAttempts.startedAt, new Date(`${to}T23:59:59+03:00`))))
      .groupBy(day);
    for (const r of started) { const p = points.get(r.day); if (p) p.second += r.n; }
  }
  return [...points.values()];
}

/** Daily views of many items at once (for the small charts on «أداء الصفحات»): key → day → views. */
export async function viewsByDay(slug: string, env: SiteEnv, keys: string[], from: string, to: string): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!hasDb() || !keys.length) return out;
  const tenantId = await activeTenantId(slug);
  if (!tenantId) return out;
  const rows = await db().select({ day: analyticsDaily.day, key: analyticsDaily.key, n: sql<number>`sum(${analyticsDaily.value})::int` }).from(analyticsDaily)
    .where(and(eq(analyticsDaily.tenantId, tenantId), eq(analyticsDaily.env, env), eq(analyticsDaily.metric, "page_view"), inArray(analyticsDaily.key, keys.slice(0, 500)), gte(analyticsDaily.day, from), lte(analyticsDaily.day, to)))
    .groupBy(analyticsDaily.day, analyticsDaily.key);
  for (const r of rows) {
    if (!out.has(r.key)) out.set(r.key, new Map());
    out.get(r.key)!.set(String(r.day), r.n);
  }
  return out;
}

/** The Cairo days from `days - 1` days ago to today. */
export function lastDays(days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(cairoDay(new Date(now.getTime() - i * 86_400_000)));
  return out;
}
