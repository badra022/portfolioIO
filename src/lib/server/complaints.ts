import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { SiteEnv } from "@/lib/environments";
import { cairoDay } from "@/lib/analytics";

/**
 * The anonymous complaints box (components/Complaints.tsx → api/c). A row holds the
 * message, its topic and the day: nothing about who sent it (see the table in
 * lib/db/schema.ts).
 */
const { complaints, tenants } = schema;

export const COMPLAINT_STATUSES = ["new", "read", "done"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const MAX_MESSAGE = 2000;
export const MIN_MESSAGE = 5;
/** Per teacher and day: stops a script from filling the box without tracking anyone. */
const DAILY_CAP = 300;

export type ComplaintRow = { id: number; day: string; topic: string | null; message: string; status: ComplaintStatus };

async function tenantIdOf(slug: string): Promise<string | null> {
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id ?? null;
}

/** Cleans the student's input against the section's topics. Null when there is no message to keep. */
export function cleanComplaint(body: unknown, categories: string[]): { topic: string | null; message: string } | null {
  const b = (body ?? {}) as { message?: unknown; topic?: unknown };
  const message = typeof b.message === "string" ? b.message.replace(/\r\n?/g, "\n").trim().slice(0, MAX_MESSAGE) : "";
  if (message.length < MIN_MESSAGE) return null;
  const topic = typeof b.topic === "string" && categories.includes(b.topic) ? b.topic : null;
  return { topic, message };
}

export async function saveComplaint(tenantId: string, env: SiteEnv, c: { topic: string | null; message: string }): Promise<"ok" | "full"> {
  const day = cairoDay();
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(complaints)
    .where(and(eq(complaints.tenantId, tenantId), eq(complaints.env, env), eq(complaints.day, day)));
  if (n >= DAILY_CAP) return "full";
  await db().insert(complaints).values({ tenantId, env, day, topic: c.topic, message: c.message });
  return "ok";
}

export async function listComplaints(slug: string, f: { env: SiteEnv; status?: ComplaintStatus; topic?: string; limit?: number; offset?: number }) {
  const empty = { rows: [] as ComplaintRow[], total: 0, counts: { new: 0, read: 0, done: 0 } as Record<ComplaintStatus, number>, topics: [] as { topic: string | null; n: number }[], month: 0 };
  if (!hasDb()) return empty;
  const id = await tenantIdOf(slug);
  if (!id) return empty;
  const base = and(eq(complaints.tenantId, id), eq(complaints.env, f.env));
  const where = and(base, f.status ? eq(complaints.status, f.status) : undefined, f.topic ? eq(complaints.topic, f.topic) : undefined);
  const monthStart = `${cairoDay().slice(0, 7)}-01`;
  const d = db();
  const [rows, total, byStatus, byTopic, month] = await Promise.all([
    d.select().from(complaints).where(where).orderBy(desc(complaints.day), desc(complaints.id)).limit(f.limit ?? 50).offset(f.offset ?? 0),
    d.select({ n: sql<number>`count(*)::int` }).from(complaints).where(where),
    d.select({ status: complaints.status, n: sql<number>`count(*)::int` }).from(complaints).where(base).groupBy(complaints.status),
    d.select({ topic: complaints.topic, n: sql<number>`count(*)::int` }).from(complaints).where(base).groupBy(complaints.topic),
    d.select({ n: sql<number>`count(*)::int` }).from(complaints).where(and(base, gte(complaints.day, monthStart))),
  ]);
  const counts = { new: 0, read: 0, done: 0 } as Record<ComplaintStatus, number>;
  for (const r of byStatus) counts[r.status as ComplaintStatus] = r.n;
  return {
    rows: rows.map((r) => ({ id: r.id, day: r.day, topic: r.topic, message: r.message, status: r.status as ComplaintStatus })),
    total: total[0]?.n ?? 0,
    counts,
    topics: byTopic.sort((a, b) => b.n - a.n),
    month: month[0]?.n ?? 0,
  };
}

/** Unread complaints, for the menu badge and the admin home. */
export async function countNewComplaints(slug: string, env: SiteEnv): Promise<number> {
  if (!hasDb()) return 0;
  const id = await tenantIdOf(slug);
  if (!id) return 0;
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(complaints)
    .where(and(eq(complaints.tenantId, id), eq(complaints.env, env), eq(complaints.status, "new")));
  return n;
}

export async function setComplaintStatus(slug: string, ids: number[], status: ComplaintStatus): Promise<void> {
  const id = await tenantIdOf(slug);
  if (!id || !ids.length) return;
  await db().update(complaints).set({ status }).where(and(eq(complaints.tenantId, id), inArray(complaints.id, ids)));
}

export async function deleteComplaints(slug: string, ids: number[]): Promise<void> {
  const id = await tenantIdOf(slug);
  if (!id || !ids.length) return;
  await db().delete(complaints).where(and(eq(complaints.tenantId, id), inArray(complaints.id, ids)));
}
