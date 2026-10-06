import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import {
  CHANNELS, DEVICES, GROUPS, MAX_DWELL, PERIODS, PLACES, SOURCES,
  cairoDay, dwellBucket, groupsOf,
} from "@/lib/analytics";
import { SectionKey } from "@/lib/schema";

const { analyticsDaily, tenants } = schema;

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

const ok = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const PLACE_KEYS: readonly string[] = [...SectionKey.options, ...PLACES, "other"];
const periodsIn = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((p) => ok(PERIODS, p)))] : []);

/**
 * Turns one batch from the browser into counter increments. Anything unexpected is
 * dropped, so a forged request can at most add to known counters.
 */
export function toCounters(body: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const add = (metric: string, key: string, n = 1) => out.set(`${metric}\u0000${key}`, (out.get(`${metric}\u0000${key}`) ?? 0) + n);
  const events = (body as { e?: unknown })?.e;
  if (!Array.isArray(events)) return out;
  let views = 0, dwells = 0;
  for (const e of events.slice(0, 40) as Record<string, unknown>[]) {
    if (!e || typeof e !== "object") continue;
    switch (e.t) {
      case "view":
        if (views++) break; // one view per batch
        add("views", "");
        if (ok(DEVICES, e.dev)) add("device", e.dev);
        if (ok(SOURCES, e.src)) add("source", e.src);
        for (const p of periodsIn(e.u)) add("visitors", p);
        break;
      case "sec":
        if (typeof e.k === "string" && PLACE_KEYS.includes(e.k)) add("section", e.k);
        break;
      case "click": {
        if (!ok(CHANNELS, e.ch)) break;
        add("click", e.ch);
        add("click_at", typeof e.at === "string" && PLACE_KEYS.includes(e.at) ? e.at : "other");
        const u = (e.u && typeof e.u === "object" ? e.u : {}) as Record<string, unknown>;
        for (const g of groupsOf(e.ch)) for (const p of periodsIn(u[g])) add("converted", `${g}:${p}`);
        break;
      }
      case "dwell": {
        if (dwells++ || typeof e.s !== "number" || !Number.isFinite(e.s)) break;
        const s = Math.max(0, Math.min(MAX_DWELL, Math.round(e.s)));
        add("dwell_n", "");
        add("dwell_s", "", s);
        add("dwell_b", dwellBucket(s));
        break;
      }
    }
  }
  return out;
}

/** Adds the counters to today's row for the teacher (Cairo day), all in one statement. */
export async function record(tenantId: string, counters: Map<string, number>, at = new Date()): Promise<void> {
  if (!counters.size) return;
  const day = cairoDay(at);
  const rows = [...counters].map(([k, value]) => {
    const [metric, key] = k.split("\u0000");
    return { tenantId, day, metric, key, value };
  });
  await db().insert(analyticsDaily).values(rows).onConflictDoUpdate({
    target: [analyticsDaily.tenantId, analyticsDaily.day, analyticsDaily.metric, analyticsDaily.key],
    set: { value: sql`${analyticsDaily.value} + excluded.value` },
  });
}

// slug -> tenant id, per server instance (ids never change).
const ids = new Map<string, string | null>();
export async function activeTenantId(slug: string): Promise<string | null> {
  if (ids.has(slug)) return ids.get(slug)!;
  const row = (await db().select({ id: tenants.id, status: tenants.status }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  const id = row && row.status === "active" ? row.id : null;
  if (ids.size > 1000) ids.clear();
  if (row) ids.set(slug, id);
  return id;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export const RANGES = ["today", "month", "lastMonth", "all"] as const;
export type RangeT = (typeof RANGES)[number];

/** The days a range covers and which unique-visitor flag counts it. */
export function rangeOf(range: RangeT, now = new Date()): { from: string | null; to: string; period: "d" | "m" | "e" } {
  const today = cairoDay(now);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (range) {
    case "today": return { from: today, to: today, period: "d" };
    case "month": return { from: `${y}-${pad(m)}-01`, to: today, period: "m" };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}`, period: "m" };
    }
    default: return { from: null, to: today, period: "e" };
  }
}

export type Totals = Map<string, Map<string, number>>;

async function sums(tenantId: string, from: string | null, to: string): Promise<Totals> {
  const rows = await db()
    .select({ metric: analyticsDaily.metric, key: analyticsDaily.key, value: sql<number>`sum(${analyticsDaily.value})::bigint` })
    .from(analyticsDaily)
    .where(and(eq(analyticsDaily.tenantId, tenantId), from ? gte(analyticsDaily.day, from) : undefined, lte(analyticsDaily.day, to)))
    .groupBy(analyticsDaily.metric, analyticsDaily.key);
  const out: Totals = new Map();
  for (const r of rows) {
    if (!out.has(r.metric)) out.set(r.metric, new Map());
    out.get(r.metric)!.set(r.key, Number(r.value));
  }
  return out;
}

export type Report = {
  range: RangeT;
  from: string | null;
  to: string;
  views: number;
  visitors: number;
  converted: Record<(typeof GROUPS)[number], number>;
  clicks: { key: string; value: number }[];
  clicksAt: { key: string; value: number }[];
  sections: Record<string, number>;
  dwell: { avg: number; buckets: { key: string; value: number }[] };
  devices: { key: string; value: number }[];
  sources: { key: string; value: number }[];
  daily: { day: string; views: number; visitors: number; contacts: number }[];
};

const sorted = (m: Map<string, number> | undefined) =>
  [...(m ?? new Map<string, number>())].map(([key, value]) => ({ key, value })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

/** Everything the dashboard shows for one teacher. Null when there is no database. */
export async function report(slug: string, range: RangeT, now = new Date()): Promise<Report | null> {
  if (!hasDb()) return null;
  const row = (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  if (!row) return null;
  const { from, to, period } = rangeOf(range, now);
  const [t, daily] = await Promise.all([sums(row.id, from, to), dailySeries(row.id, now)]);
  const one = (metric: string, key = "") => t.get(metric)?.get(key) ?? 0;
  const n = one("dwell_n");
  return {
    range, from, to,
    views: one("views"),
    visitors: one("visitors", period),
    converted: Object.fromEntries(GROUPS.map((g) => [g, one("converted", `${g}:${period}`)])) as Report["converted"],
    clicks: sorted(t.get("click")),
    clicksAt: sorted(t.get("click_at")),
    sections: Object.fromEntries(t.get("section") ?? []),
    dwell: {
      avg: n ? Math.round(one("dwell_s") / n) : 0,
      buckets: ["0-10", "10-30", "30-120", "120-600", "600+"].map((key) => ({ key, value: one("dwell_b", key) })),
    },
    devices: sorted(t.get("device")),
    sources: sorted(t.get("source")),
    daily,
  };
}

/** The last 30 days, one entry per day (zeros included) for the chart. */
async function dailySeries(tenantId: string, now: Date): Promise<Report["daily"]> {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) days.push(cairoDay(new Date(now.getTime() - i * 86_400_000)));
  const rows = await db()
    .select({ day: analyticsDaily.day, metric: analyticsDaily.metric, key: analyticsDaily.key, value: analyticsDaily.value })
    .from(analyticsDaily)
    .where(and(
      eq(analyticsDaily.tenantId, tenantId),
      gte(analyticsDaily.day, days[0]),
      inArray(analyticsDaily.metric, ["views", "visitors", "converted"]),
      inArray(analyticsDaily.key, ["", "d", "contact:d"]),
    ));
  const by = new Map(days.map((d) => [d, { day: d, views: 0, visitors: 0, contacts: 0 }]));
  for (const r of rows) {
    const e = by.get(r.day);
    if (!e) continue;
    if (r.metric === "views") e.views = Number(r.value);
    else if (r.metric === "visitors" && r.key === "d") e.visitors = Number(r.value);
    else if (r.metric === "converted" && r.key === "contact:d") e.contacts = Number(r.value);
  }
  return [...by.values()];
}

export type Overview = { slug: string; name: string; views: number; visitors: number; contacts: number; allTimeVisitors: number };

/** Every teacher this month (and all-time visitors), for the platform console. */
export async function overview(now = new Date()): Promise<Overview[]> {
  if (!hasDb()) return [];
  const { from } = rangeOf("month", now);
  const rows = await db()
    .select({
      slug: tenants.slug,
      name: tenants.name,
      views: sql<number>`coalesce(sum(${analyticsDaily.value}) filter (where ${analyticsDaily.metric} = 'views' and ${analyticsDaily.day} >= ${from}), 0)::bigint`,
      visitors: sql<number>`coalesce(sum(${analyticsDaily.value}) filter (where ${analyticsDaily.metric} = 'visitors' and ${analyticsDaily.key} = 'm' and ${analyticsDaily.day} >= ${from}), 0)::bigint`,
      contacts: sql<number>`coalesce(sum(${analyticsDaily.value}) filter (where ${analyticsDaily.metric} = 'converted' and ${analyticsDaily.key} = 'contact:m' and ${analyticsDaily.day} >= ${from}), 0)::bigint`,
      allTimeVisitors: sql<number>`coalesce(sum(${analyticsDaily.value}) filter (where ${analyticsDaily.metric} = 'visitors' and ${analyticsDaily.key} = 'e'), 0)::bigint`,
    })
    .from(tenants)
    .leftJoin(analyticsDaily, eq(analyticsDaily.tenantId, tenants.id))
    .groupBy(tenants.slug, tenants.name)
    .orderBy(tenants.name);
  return rows.map((r) => ({ ...r, views: Number(r.views), visitors: Number(r.visitors), contacts: Number(r.contacts), allTimeVisitors: Number(r.allTimeVisitors) }));
}
