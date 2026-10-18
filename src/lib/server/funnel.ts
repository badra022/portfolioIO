import "server-only";
import { and, gte, lte, sql } from "drizzle-orm";
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
 */
export const FUNNEL_STEPS = ["1", "2", "3", "4"] as const;
const OK_METRIC = /^(view|submit|built|step:[1-4]|rejected:[a-z]{2,20})$/;

export async function count(metrics: string[], at = new Date()): Promise<void> {
  if (!hasDb()) return;
  const day = cairoDay(at);
  const rows = [...new Set(metrics)].filter((m) => OK_METRIC.test(m)).slice(0, 8).map((m) => {
    const [metric, key = ""] = m.split(":");
    return { day, metric, key, value: 1 };
  });
  if (!rows.length) return;
  await db().insert(platformDaily).values(rows).onConflictDoUpdate({
    target: [platformDaily.day, platformDaily.metric, platformDaily.key],
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

/** The funnel between two Cairo days (from null = since the start). */
export async function funnel(from: string | null, to: string): Promise<Funnel> {
  const out: Funnel = { views: 0, steps: { 1: 0, 2: 0, 3: 0, 4: 0 }, submits: 0, built: 0, rejected: {}, days: [] };
  if (!hasDb()) return out;
  const where = from ? and(gte(platformDaily.day, from), lte(platformDaily.day, to)) : lte(platformDaily.day, to);
  const rows = await db().select().from(platformDaily).where(where);
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
