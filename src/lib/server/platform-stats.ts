import "server-only";
import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { CONTACT, SOCIAL, cairoDay, type PeriodT } from "@/lib/analytics";

const { analyticsDaily, tenants, submissions, quizAttempts, examResults } = schema;

/**
 * The super admin's numbers across every teacher (production only: the private
 * preview is left out). Everything is filed by Cairo day, so any date range works;
 * unique visitors are exact only for ranges the browser counts them for (a day, a
 * calendar month, all time), otherwise they're the sum of each day's uniques.
 */

export const PRESETS = ["today", "7d", "30d", "month", "lastMonth", "all"] as const;
export type Preset = (typeof PRESETS)[number];
export type StatsRange = { preset: Preset | "custom"; from: string | null; to: string; unique: PeriodT | null };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The range from the page's query (?range=… or ?from=…&to=…). Defaults to the last 30 days. */
export function statsRange(q: { range?: string; from?: string; to?: string }, now = new Date()): StatsRange {
  const today = cairoDay(now);
  if (q.from && DAY_RE.test(q.from)) {
    let from = q.from, to = q.to && DAY_RE.test(q.to) ? q.to : today;
    if (to > today) to = today;
    if (from > to) [from, to] = [to, from];
    return { preset: "custom", from, to, unique: from === to ? "d" : null };
  }
  const preset = (PRESETS as readonly string[]).includes(q.range ?? "") ? (q.range as Preset) : "30d";
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "today": return { preset, from: today, to: today, unique: "d" };
    case "7d": return { preset, from: addDays(today, -6), to: today, unique: null };
    case "30d": return { preset, from: addDays(today, -29), to: today, unique: null };
    case "month": return { preset, from: `${y}-${pad(m)}-01`, to: today, unique: "m" };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      return { preset, from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(new Date(Date.UTC(py, pm, 0)).getUTCDate())}`, unique: "m" };
    }
    default: return { preset: "all", from: null, to: today, unique: "e" };
  }
}

/** One point of a trend: a day (YYYY-MM-DD) or, for long ranges, a month (YYYY-MM). */
export type Point = { key: string; views: number; visitors: number; engagements: number; actions: number };

export type TeacherStats = {
  slug: string; name: string; active: boolean;
  views: number; visitors: number; engagements: number;
  contacts: number; channels: number; forms: number; attempts: number; lookups: number;
};

export type PlatformStats = {
  range: StatsRange;
  /** First day actually covered (for "all time", the first day with data). */
  from: string;
  teachers: { total: number; active: number; added: number };
  views: number;
  /** Exact unique visitors when the range allows it (summed across teachers), else the sum of daily uniques. */
  visitors: number;
  visitorsExact: boolean;
  /** Visitors who contacted a teacher or went to their channels (exact ranges only). */
  engaged: number | null;
  engagements: number;
  breakdown: { contacts: number; channels: number; videos: number; links: number; forms: number; examBookings: number; attempts: number; finished: number; lookups: number; found: number };
  exams: { quizzes: number; examCards: number; resultSets: number; resultStudents: number };
  series: Point[];
  bucket: "day" | "month";
  perTeacher: TeacherStats[];
};

/** A timestamp column as a Cairo day, for ranges and per-day counts. */
const cairo = (col: SQL | unknown) => sql<string>`to_char((${col} at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD')`;

export async function platformStats(range: StatsRange): Promise<PlatformStats | null> {
  if (!hasDb()) return null;
  const d = db();
  const { from, to, unique } = range;
  const inDays = (day: SQL) => and(from ? sql`${day} >= ${from}` : undefined, sql`${day} <= ${to}`);

  const [teacherRows, analyticRows, dailyRows, subRows, subDaily, attemptRows, attemptDaily, resultRows, firstDay] = await Promise.all([
    d.select({
      id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status, created: cairo(tenants.createdAt),
      quizzes: sql<number>`coalesce(jsonb_array_length(${tenants.content}->'quizzes'), 0)::int`,
      examCards: sql<number>`coalesce(jsonb_array_length(${tenants.content}->'exams'->'items'), 0)::int`,
    }).from(tenants).orderBy(tenants.name),
    d.select({ tenantId: analyticsDaily.tenantId, metric: analyticsDaily.metric, key: analyticsDaily.key, value: sql<number>`sum(${analyticsDaily.value})::bigint` })
      .from(analyticsDaily)
      .where(and(eq(analyticsDaily.env, "production"), from ? gte(analyticsDaily.day, from) : undefined, lte(analyticsDaily.day, to),
        inArray(analyticsDaily.metric, ["views", "visitors", "click", "converted", "lookup", "lookup_found"])))
      .groupBy(analyticsDaily.tenantId, analyticsDaily.metric, analyticsDaily.key),
    d.select({ day: sql<string>`to_char(${analyticsDaily.day}, 'YYYY-MM-DD')`, metric: analyticsDaily.metric, key: analyticsDaily.key, value: sql<number>`sum(${analyticsDaily.value})::bigint` })
      .from(analyticsDaily)
      .where(and(eq(analyticsDaily.env, "production"), from ? gte(analyticsDaily.day, from) : undefined, lte(analyticsDaily.day, to),
        inArray(analyticsDaily.metric, ["views", "visitors", "click", "lookup"])))
      .groupBy(analyticsDaily.day, analyticsDaily.metric, analyticsDaily.key),
    d.select({
      tenantId: submissions.tenantId, n: sql<number>`count(*)::int`,
      // Bookings from an exam card's form carry the exam in their details.
      exams: sql<number>`count(*) filter (where ${submissions.context} ? 'الامتحان')::int`,
    }).from(submissions).where(and(eq(submissions.env, "production"), inDays(cairo(submissions.createdAt)))).groupBy(submissions.tenantId),
    d.select({ day: cairo(submissions.createdAt), n: sql<number>`count(*)::int` })
      .from(submissions).where(and(eq(submissions.env, "production"), inDays(cairo(submissions.createdAt)))).groupBy(sql`1`),
    d.select({
      tenantId: quizAttempts.tenantId, n: sql<number>`count(*)::int`,
      finished: sql<number>`count(*) filter (where ${quizAttempts.status} <> 'in_progress')::int`,
    }).from(quizAttempts).where(and(eq(quizAttempts.env, "production"), inDays(cairo(quizAttempts.startedAt)))).groupBy(quizAttempts.tenantId),
    d.select({ day: cairo(quizAttempts.startedAt), n: sql<number>`count(*)::int` })
      .from(quizAttempts).where(and(eq(quizAttempts.env, "production"), inDays(cairo(quizAttempts.startedAt)))).groupBy(sql`1`),
    d.select({
      sets: sql<number>`count(*)::int`,
      students: sql<number>`coalesce(sum(jsonb_array_length(${examResults.rows})), 0)::int`,
    }).from(examResults),
    // "All time" starts at the first day anything was recorded.
    from ? Promise.resolve([{ day: from }]) : d.select({ day: sql<string>`to_char(min(${analyticsDaily.day}), 'YYYY-MM-DD')` }).from(analyticsDaily).where(eq(analyticsDaily.env, "production")),
  ]);

  const start = from ?? firstDay[0]?.day ?? teacherRows.map((t) => t.created).sort()[0] ?? to;

  // Per teacher.
  const per = new Map<string, TeacherStats>(teacherRows.map((t) => [t.id, {
    slug: t.slug, name: t.name, active: t.status === "active",
    views: 0, visitors: 0, engagements: 0, contacts: 0, channels: 0, forms: 0, attempts: 0, lookups: 0,
  }]));
  let videos = 0, links = 0, found = 0, engaged = 0, dailyUniques = 0;
  for (const r of analyticRows) {
    const t = per.get(r.tenantId);
    if (!t) continue;
    const v = Number(r.value);
    if (r.metric === "views") t.views += v;
    else if (r.metric === "visitors" && r.key === (unique ?? "d")) t.visitors += v;
    else if (r.metric === "converted" && unique && r.key === `any:${unique}`) engaged += v;
    else if (r.metric === "lookup") t.lookups += v;
    else if (r.metric === "lookup_found") found += v;
    else if (r.metric === "click") {
      // Sent forms are counted from the requests themselves (below), not from the click.
      if (CONTACT.has(r.key) && r.key !== "form") t.contacts += v;
      else if (SOCIAL.has(r.key)) t.channels += v;
      else if (r.key === "video") videos += v;
      else if (r.key === "link") links += v;
    }
    if (r.metric === "visitors" && r.key === "d") dailyUniques += v;
  }
  let examBookings = 0, finished = 0;
  for (const r of subRows) { const t = per.get(r.tenantId); if (t) t.forms += r.n; examBookings += r.exams; }
  for (const r of attemptRows) { const t = per.get(r.tenantId); if (t) t.attempts += r.n; finished += r.finished; }
  const teachers = [...per.values()];
  for (const t of teachers) t.engagements = t.contacts + t.channels + t.forms + t.attempts + t.lookups;
  const sum = (k: keyof TeacherStats) => teachers.reduce((a, t) => a + (t[k] as number), 0);

  // Trend: per day, or per month for ranges longer than about three months.
  const days: string[] = [];
  for (let day = start; day <= to && days.length < 4000; day = addDays(day, 1)) days.push(day);
  const bucket: "day" | "month" = days.length > 92 ? "month" : "day";
  const keyOf = (day: string) => (bucket === "month" ? day.slice(0, 7) : day);
  const series = new Map<string, Point>();
  for (const day of days) if (!series.has(keyOf(day))) series.set(keyOf(day), { key: keyOf(day), views: 0, visitors: 0, engagements: 0, actions: 0 });
  const at = (day: string) => series.get(keyOf(day));
  for (const r of dailyRows) {
    const p = at(r.day);
    if (!p) continue;
    const v = Number(r.value);
    if (r.metric === "views") p.views += v;
    else if (r.metric === "visitors" && r.key === "d") p.visitors += v;
    else if (r.metric === "lookup") { p.engagements += v; p.actions += v; }
    else if (r.metric === "click" && r.key !== "form" && (CONTACT.has(r.key) || SOCIAL.has(r.key))) p.engagements += v;
  }
  for (const r of [...subDaily, ...attemptDaily]) {
    const p = at(r.day);
    if (p) { p.engagements += r.n; p.actions += r.n; }
  }

  return {
    range,
    from: start,
    teachers: { total: teacherRows.length, active: teacherRows.filter((t) => t.status === "active").length, added: teacherRows.filter((t) => t.created >= start && t.created <= to).length },
    views: sum("views"),
    visitors: unique ? sum("visitors") : dailyUniques,
    visitorsExact: unique !== null,
    engaged: unique ? engaged : null,
    engagements: sum("engagements"),
    breakdown: { contacts: sum("contacts"), channels: sum("channels"), videos, links, forms: sum("forms"), examBookings, attempts: sum("attempts"), finished, lookups: sum("lookups"), found },
    exams: {
      quizzes: teacherRows.reduce((a, t) => a + t.quizzes, 0),
      examCards: teacherRows.reduce((a, t) => a + t.examCards, 0),
      resultSets: resultRows[0]?.sets ?? 0,
      resultStudents: resultRows[0]?.students ?? 0,
    },
    series: [...series.values()],
    bucket,
    perTeacher: teachers.sort((a, b) => b.views - a.views || b.engagements - a.engagements),
  };
}
