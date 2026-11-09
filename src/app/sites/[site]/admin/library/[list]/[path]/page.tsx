import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { itemSeries, lastDays } from "@/lib/server/library";
import { PlanBlocked } from "@/components/admin/PlanBlocked";
import { ItemTrend } from "@/components/admin/ItemTrend";
import { CopyLink } from "@/components/admin/CopyLink";

export const metadata: Metadata = { title: "الرسم البياني" };

const RANGES = { "30": "آخر 30 يوم", "90": "آخر 3 شهور", "365": "آخر سنة" } as const;
type RangeKey = keyof typeof RANGES;

/**
 * One article's, game's or quiz's numbers day by day (like an ad campaign's chart):
 * views, plus plays (games) or students who started (quizzes).
 */
export default async function LibraryItem({ params, searchParams }: PageProps<"/sites/[site]/admin/library/[list]/[path]">) {
  const { site: raw, list, path: rawPath } = await params;
  const site = decodeURIComponent(raw);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  if (!t.permissions.library) return <PlanBlocked feature="library" back={`${base}/admin`} />;
  const env = await adminEnv();
  const c = copyFor(t, env).content;
  const path = decodeURIComponent(rawPath);
  const item = list === "articles" ? c.articles.find((a) => a.path === path)
    : list === "games" ? c.games.find((g) => g.path === path)
    : list === "quizzes" ? c.quizzes.find((q) => q.path === path) : undefined;
  if (!item) notFound();
  const kind = list === "articles" ? "article" : list === "games" ? "game" : "quiz";
  const q = (await searchParams).range;
  const range: RangeKey = q === "90" || q === "365" ? q : "30";
  const days = lastDays(Number(range));
  const points = await itemSeries(slug, env, kind, path, days[0], days[days.length - 1]).catch(() => []);
  const href = kind === "article" ? `${base}/articles/${path}` : kind === "game" ? `${base}/games/${path}` : `${base}/${path}`;
  const best = [...points].sort((a, b) => b.views - a.views)[0];
  const lastWeek = points.slice(-7).reduce((n, p) => n + p.views, 0);
  const weekBefore = points.slice(-14, -7).reduce((n, p) => n + p.views, 0);
  const change = weekBefore ? Math.round(((lastWeek - weekBefore) / weekBefore) * 100) : null;

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin/library`}>← أداء الصفحات</a>
        <h1>{item.title}</h1>
        <CopyLink path={href} />
        <div className="a-actions">
          {(Object.keys(RANGES) as RangeKey[]).map((k) => (
            <a key={k} className={`btn-sm ${k === range ? "primary" : "ghost"}`} href={`?range=${k}`}>{RANGES[k]}</a>
          ))}
        </div>
      </div>
      <div className="lib-admin-stats big">
        <span><b>{lastWeek.toLocaleString("en-US")}</b> مشاهدة آخر 7 أيام</span>
        {change !== null && <span><b dir="ltr">{change > 0 ? `+${change}` : change}%</b> عن الأسبوع اللي قبله</span>}
        {best && best.views > 0 && <span>أعلى يوم <b>{best.day}</b> ({best.views.toLocaleString("en-US")})</span>}
      </div>
      <ItemTrend points={points} title={`المشاهدات: ${RANGES[range]}`} second={kind === "game" ? "مرات اللعب" : kind === "quiz" ? "بدأوا الاختبار" : undefined} />
    </>
  );
}
