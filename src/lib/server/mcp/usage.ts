import "server-only";
import { and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";

const { mcpCalls } = schema;

/** How long usage rows are kept. */
export const USAGE_DAYS = 30;

export type UsageRow = { actor: string; scope: "super" | "partner" | "teacher"; slug: string | null; tool: string; ms: number; bytes: number; error: string | null };

/** Records one tool call. Never throws: a full log must not fail the call it describes. */
export async function recordUsage(row: UsageRow): Promise<void> {
  if (!hasDb()) return;
  try { await db().insert(mcpCalls).values(row); } catch (e) { console.error("mcp usage", e); }
}

export async function sweepUsage(): Promise<number> {
  const rows = await db().delete(mcpCalls).where(sql`${mcpCalls.at} < now() - make_interval(days => ${USAGE_DAYS})`).returning({ id: mcpCalls.id });
  return rows.length;
}

export type UsageReport = {
  days: number;
  calls: number;
  errors: number;
  tools: { tool: string; calls: number; errors: number; avgMs: number; avgBytes: number; maxBytes: number }[];
  codes: { error: string; tool: string; calls: number; last: string }[];
  actors: { actor: string; scope: string; calls: number; errors: number; last: string }[];
  recentErrors: { at: string; actor: string; slug: string | null; tool: string; error: string }[];
};

/** What agents did in the last `days`: per tool, per error code, per account. */
export async function usageReport(days = 7): Promise<UsageReport> {
  const empty: UsageReport = { days, calls: 0, errors: 0, tools: [], codes: [], actors: [], recentErrors: [] };
  if (!hasDb()) return empty;
  const d = db();
  const since = gte(mcpCalls.at, new Date(Date.now() - days * 86400_000));
  const n = sql<number>`count(*)::int`;
  const failed = sql<number>`count(*) filter (where ${mcpCalls.error} is not null)::int`;
  const [tools, codes, actors, recent] = await Promise.all([
    d.select({ tool: mcpCalls.tool, calls: n, errors: failed, avgMs: sql<number>`round(avg(${mcpCalls.ms}))::int`, avgBytes: sql<number>`round(avg(${mcpCalls.bytes}))::int`, maxBytes: sql<number>`max(${mcpCalls.bytes})::int` })
      .from(mcpCalls).where(since).groupBy(mcpCalls.tool).orderBy(desc(n)),
    d.select({ error: sql<string>`${mcpCalls.error}`, tool: mcpCalls.tool, calls: n, last: sql<Date>`max(${mcpCalls.at})` })
      .from(mcpCalls).where(and(since, isNotNull(mcpCalls.error))).groupBy(mcpCalls.error, mcpCalls.tool).orderBy(desc(n)).limit(30),
    d.select({ actor: mcpCalls.actor, scope: mcpCalls.scope, calls: n, errors: failed, last: sql<Date>`max(${mcpCalls.at})` })
      .from(mcpCalls).where(since).groupBy(mcpCalls.actor, mcpCalls.scope).orderBy(desc(n)).limit(30),
    d.select({ at: mcpCalls.at, actor: mcpCalls.actor, slug: mcpCalls.slug, tool: mcpCalls.tool, error: sql<string>`${mcpCalls.error}` })
      .from(mcpCalls).where(and(since, isNotNull(mcpCalls.error))).orderBy(desc(mcpCalls.at)).limit(25),
  ]);
  const iso = (v: Date | string) => new Date(v).toISOString();
  return {
    days,
    calls: tools.reduce((a, t) => a + t.calls, 0),
    errors: tools.reduce((a, t) => a + t.errors, 0),
    tools,
    codes: codes.map((c) => ({ ...c, last: iso(c.last) })),
    actors: actors.map((a) => ({ ...a, last: iso(a.last) })),
    recentErrors: recent.map((r) => ({ ...r, at: iso(r.at) })),
  };
}
