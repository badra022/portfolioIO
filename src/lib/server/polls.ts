import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { SiteEnv } from "@/lib/environments";
import type { PollT } from "@/lib/schema";
import { pollStatus } from "@/lib/poll";

const { pollVotes, tenants } = schema;

/** Votes per choice (by position), and the total. */
export type PollResults = { counts: number[]; total: number };

async function counts(tenantId: string, env: SiteEnv, poll: PollT): Promise<PollResults> {
  const rows = await db().select({ choice: pollVotes.choice, votes: pollVotes.votes }).from(pollVotes)
    .where(and(eq(pollVotes.tenantId, tenantId), eq(pollVotes.env, env), eq(pollVotes.pollPath, poll.path)));
  const out = poll.choices.map(() => 0);
  for (const r of rows) if (r.choice >= 0 && r.choice < out.length) out[r.choice] = r.votes;
  return { counts: out, total: out.reduce((a, b) => a + b, 0) };
}

export type VoteResult = { ok: true; results: PollResults } | { ok: false; error: "closed" | "notYet" | "over" | "choice" };

/** Counts one anonymous vote. Nothing about the voter is stored. */
export async function castVote(tenantId: string, env: SiteEnv, poll: PollT, choice: unknown): Promise<VoteResult> {
  const s = pollStatus(poll);
  if (!s.open) return { ok: false, error: s.reason };
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= poll.choices.length) return { ok: false, error: "choice" };
  await db().insert(pollVotes).values({ tenantId, env, pollPath: poll.path, choice, votes: 1 })
    .onConflictDoUpdate({ target: [pollVotes.tenantId, pollVotes.env, pollVotes.pollPath, pollVotes.choice], set: { votes: sql`${pollVotes.votes} + 1` } });
  return { ok: true, results: await counts(tenantId, env, poll) };
}

export async function pollResults(tenantId: string, env: SiteEnv, poll: PollT): Promise<PollResults> {
  return counts(tenantId, env, poll);
}

async function tenantIdOf(slug: string): Promise<string | null> {
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id ?? null;
}

/** Results for the admin panel. */
export async function resultsFor(slug: string, env: SiteEnv, poll: PollT): Promise<PollResults> {
  if (!hasDb()) return { counts: poll.choices.map(() => 0), total: 0 };
  const id = await tenantIdOf(slug);
  return id ? counts(id, env, poll) : { counts: poll.choices.map(() => 0), total: 0 };
}

/** Totals per vote (by path), for the admin list. */
export async function totals(slug: string, env: SiteEnv): Promise<Record<string, number>> {
  if (!hasDb()) return {};
  const id = await tenantIdOf(slug);
  if (!id) return {};
  const rows = await db().select({ path: pollVotes.pollPath, total: sql<number>`sum(${pollVotes.votes})::int` }).from(pollVotes)
    .where(and(eq(pollVotes.tenantId, id), eq(pollVotes.env, env))).groupBy(pollVotes.pollPath);
  return Object.fromEntries(rows.map((r) => [r.path, r.total]));
}

/** Starts a vote's counts over. */
export async function resetVotes(slug: string, env: SiteEnv, path: string): Promise<void> {
  const id = await tenantIdOf(slug);
  if (id) await db().delete(pollVotes).where(and(eq(pollVotes.tenantId, id), eq(pollVotes.env, env), eq(pollVotes.pollPath, path)));
}
