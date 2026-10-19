import "server-only";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { cairoDay } from "@/lib/analytics";

const { platformDaily } = schema;

/**
 * The platform home page's funnel (components/signup/SignupFlow.tsx → api/signup/track,
 * and api/signup when a site is built), counted per page load:
 *   view       the page was opened
 *   step:<n>   the form reached step n (1-4)
 *   submit     «ابني موقعي» was pressed with a complete form
 *   built      a trial site was made
 *   rejected:<reason>  the build was refused (limits, used number, device...)
 * Each page counts on its own (source): "" = the platform's home page, else a partner's slug
 * (its private page, lib/server/partners.ts).
 */
export const FUNNEL_STEPS = ["1", "2", "3", "4"] as const;
const OK_METRIC = /^(view|submit|built|step:[1-4]|rejected:[a-z]{2,20})$/;

export async function count(metrics: string[], at = new Date(), source = ""): Promise<void> {
  if (!hasDb()) return;
  const day = cairoDay(at);
  const rows = [...new Set(metrics)].filter((m) => OK_METRIC.test(m)).slice(0, 8).map((m) => {
    const [metric, key = ""] = m.split(":");
    return { day, source, metric, key, value: 1 };
  });
  if (!rows.length) return;
  await db().insert(platformDaily).values(rows).onConflictDoUpdate({
    target: [platformDaily.day, platformDaily.source, platformDaily.metric, platformDaily.key],
    set: { value: sql`${platformDaily.value} + excluded.value` },
  });
}

export type Funnel = {
  views: number;
  steps: Record<(typeof FUNNEL_STEPS)[number], number>;
  submits: number;
  built: number;
  rejected: Record<string, number>;
  /** Per Cairo day, for the chart. */
  days: { day: string; views: number; built: number }[];
};

const empty = (): Funnel => ({ views: 0, steps: { 1: 0, 2: 0, 3: 0, 4: 0 }, submits: 0, built: 0, rejected: {}, days: [] });

/** The funnel between two Cairo days (from null = since the start), of one page (source) or of every page ("*"). */
export async function funnel(from: string | null, to: string, source = ""): Promise<Funnel> {
  if (!hasDb()) return empty();
  return (await funnels(from, to, source))[source] ?? empty();
}

/** The funnel of every page at once, by source ("" = home page); "*" = all pages together. */
export async function funnels(from: string | null, to: string, only?: string): Promise<Record<string, Funnel>> {
  if (!hasDb()) return {};
  const conds: SQL[] = [lte(platformDaily.day, to)];
  if (from) conds.push(gte(platformDaily.day, from));
  if (only !== undefined && only !== "*") conds.push(eq(platformDaily.source, only));
  const rows = await db().select().from(platformDaily).where(and(...conds));
  const bySource = new Map<string, typeof rows>();
  for (const r of rows) {
    for (const k of [r.source, "*"]) { const l = bySource.get(k) ?? []; l.push(r); bySource.set(k, l); }
  }
  return Object.fromEntries([...bySource].map(([k, list]) => [k, fold(list)]));
}

function fold(rows: (typeof platformDaily.$inferSelect)[]): Funnel {
  const out = empty();
  const byDay = new Map<string, { views: number; built: number }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { views: 0, built: 0 };
    if (r.metric === "view") { out.views += r.value; d.views += r.value; }
    else if (r.metric === "built") { out.built += r.value; d.built += r.value; }
    else if (r.metric === "submit") out.submits += r.value;
    else if (r.metric === "step" && r.key in out.steps) out.steps[r.key as keyof Funnel["steps"]] += r.value;
    else if (r.metric === "rejected") out.rejected[r.key] = (out.rejected[r.key] ?? 0) + r.value;
    byDay.set(r.day, d);
  }
  out.days = [...byDay].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  return out;
}
