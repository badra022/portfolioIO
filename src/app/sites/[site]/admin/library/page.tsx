import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { lastDays, takerTotals, viewTotals, viewsByDay } from "@/lib/server/library";
import { isPublished, quizTab } from "@/lib/library";
import { formatWhen } from "@/lib/admin/format";
import { instantOf } from "@/lib/dates";
import { PlanBlocked } from "@/components/admin/PlanBlocked";
import { CopyLink } from "@/components/admin/CopyLink";
import { Spark } from "@/components/admin/ItemTrend";
import { updateLibraryItemAction } from "../actions";

export const metadata: Metadata = { title: "أداء الصفحات" };

const n = (v: number) => v.toLocaleString("en-US");
type List = "articles" | "games" | "quizzes";
type Row = { list: List; path: string; title: string; index: number; href: string; status: string; live: boolean; listed: boolean; showViews: boolean; enabled?: boolean; key: string; took?: number };

/**
 * The content library at a glance (articles, games, quizzes): each item's views all time
 * and over the last 30 days, a link to its day-by-day chart, and its switches: on the
 * list page or not, views shown or not, the page on or off. Pages that nobody opens any
 * more show up here, to hide or drop.
 */
export default async function LibraryAdmin({ params }: PageProps<"/sites/[site]/admin/library">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  if (!t.permissions.library) return <PlanBlocked feature="library" back={`${base}/admin`} />;
  const env = await adminEnv();
  const c = copyFor(t, env).content;
  const now = Date.now();
  const status = (x: { enabled: boolean; publishAt?: string }) => !x.enabled ? "متوقف" : !isPublished(x, now) ? `يتنشر ${formatWhen(instantOf(x.publishAt!).toISOString())}` : "منشور";
  const quizStatus = { live: "مفتوح", soon: "لسه مبدأش", closed: "مقفول" } as const;
  const rows: Row[] = [
    ...c.articles.map((a, i) => ({ list: "articles" as const, path: a.path, title: a.title, index: i, href: `${base}/articles/${a.path}`, status: status(a), live: a.enabled && isPublished(a, now), listed: a.listed, showViews: a.showViews, enabled: a.enabled, key: `a:${a.path}` })),
    ...c.games.map((g, i) => ({ list: "games" as const, path: g.path, title: g.title, index: i, href: `${base}/games/${g.path}`, status: status(g), live: g.enabled && isPublished(g, now), listed: g.listed, showViews: g.showViews, enabled: g.enabled, key: `g:${g.path}` })),
    ...c.quizzes.map((q, i) => {
      const tab = quizTab(q, now);
      return { list: "quizzes" as const, path: q.path, title: q.title, index: i, href: `${base}/${q.path}`, status: tab ? quizStatus[tab] : "مفيش أسئلة", live: tab === "live", listed: q.listed, showViews: q.showViews, key: `q:${q.path}` };
    }),
  ];
  const keys = rows.map((r) => r.key);
  const days = lastDays(30);
  const [totals, daily, took] = await Promise.all([
    viewTotals(slug, env, keys).catch(() => ({} as Record<string, number>)),
    viewsByDay(slug, env, keys, days[0], days[days.length - 1]).catch(() => new Map<string, Map<string, number>>()),
    takerTotals(slug, env).catch(() => ({} as Record<string, number>)),
  ]);
  const sections: { list: List; title: string; add: string; empty: string }[] = [
    { list: "articles", title: "المقالات", add: `${base}/admin/edit/articles?open=articles.new`, empty: "لسه مفيش مقالات." },
    { list: "games", title: "الألعاب التعليمية", add: `${base}/admin/edit/games?open=games.new`, empty: "لسه مفيش ألعاب." },
    { list: "quizzes", title: "الاختبارات الأونلاين", add: `${base}/admin/edit/quizzes?open=quizzes.new`, empty: "لسه مفيش اختبارات." },
  ];

  return (
    <>
      <div className="a-head">
        <h1>أداء الصفحات</h1>
        <p className="a-sub">
          مشاهدات كل مقال ولعبة واختبار من البداية وفي آخر 30 يوم. اضغط «الرسم البياني» تشوف كل يوم لوحده،
          واعرف الصفحات اللي محدش بيفتحها عشان تخفيها من القائمة أو توقفها.
          {!c.library.showViews && " المشاهدات مخفية عن الزوار في كل القوائم (من «المقالات» ← إعدادات صفحات المكتبة)."}
        </p>
        <div className="a-actions">
          <a className="btn-sm ghost" href={`${base}/articles`} target="_blank" rel="noopener">صفحة المقالات</a>
          <a className="btn-sm ghost" href={`${base}/exams`} target="_blank" rel="noopener">صفحة كل الاختبارات</a>
          <a className="btn-sm ghost" href={`${base}/games`} target="_blank" rel="noopener">صفحة الألعاب</a>
        </div>
      </div>
      {sections.map((sec) => {
        const list = rows.filter((r) => r.list === sec.list).sort((a, b) => (totals[b.key] ?? 0) - (totals[a.key] ?? 0));
        return (
          <section key={sec.list} className="a-panel lib-admin">
            <div className="qz-head">
              <h2>{sec.title}</h2>
              <a className="btn-sm primary" href={sec.add}>+ جديد</a>
            </div>
            {list.length === 0 && <p className="an-empty">{sec.empty}</p>}
            <ul className="qz-list">
              {list.map((r) => {
                const series = days.map((d) => daily.get(r.key)?.get(d) ?? 0);
                const month = series.reduce((x, y) => x + y, 0);
                const toggle = (field: "listed" | "showViews" | "enabled", on: boolean) => updateLibraryItemAction.bind(null, site, r.list, r.path, field, on, env);
                return (
                  <li key={r.key} className="qz-item lib-admin-row">
                    <div className="qz-head">
                      <span className={`rq-badge ${r.live ? "new" : ""}`}>{r.status}</span>
                      <b>{r.title}</b>
                    </div>
                    <div className="lib-admin-stats">
                      <span><b>{n(totals[r.key] ?? 0)}</b> مشاهدة من البداية</span>
                      <span><b>{n(month)}</b> في آخر 30 يوم</span>
                      {r.list === "quizzes" && <span><b>{n(took[r.path] ?? 0)}</b> امتحنوا</span>}
                      <Spark values={series} />
                    </div>
                    <CopyLink path={r.href} />
                    <div className="qz-actions">
                      <a className="btn-sm primary" href={`${base}/admin/library/${r.list}/${r.path}`}>الرسم البياني</a>
                      <form action={toggle("listed", !r.listed)}><button type="submit" className="btn-sm ghost">{r.listed ? "اخفي من القائمة" : "اظهر في القائمة"}</button></form>
                      <form action={toggle("showViews", !r.showViews)}><button type="submit" className="btn-sm ghost">{r.showViews ? "اخفي المشاهدات" : "اظهر المشاهدات"}</button></form>
                      {r.enabled !== undefined && <form action={toggle("enabled", !r.enabled)}><button type="submit" className="btn-sm ghost">{r.enabled ? "أوقف الصفحة" : "شغّل الصفحة"}</button></form>}
                      <a className="btn-sm ghost" href={`${base}/admin/edit/${r.list}?open=${r.list}.${r.index}`}>تعديل</a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
