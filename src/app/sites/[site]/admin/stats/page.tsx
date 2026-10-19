import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasDb } from "@/lib/env";
import { requireSuper } from "@/lib/server/auth";
import { platformStats, statsRange, type Preset } from "@/lib/server/platform-stats";
import { PlatformStatsView } from "@/components/admin/PlatformStatsView";
import { FunnelView } from "@/components/admin/FunnelView";
import { funnel } from "@/lib/server/funnel";
import { consoleData, sourceSummaries } from "@/lib/server/console";
import { SourcesTable } from "@/components/admin/SourcesTable";

export const metadata: Metadata = { title: "الإحصائيات العامة" };

const PRESET_LABEL: Record<Preset, string> = { today: "النهاردة", "7d": "آخر 7 أيام", "30d": "آخر 30 يوم", month: "الشهر ده", lastMonth: "الشهر اللي فات", all: "من البداية" };

/** Super admin only, on the platform host: numbers across every teacher. */
export default async function PlatformStatsPage({ params, searchParams }: PageProps<"/sites/[site]/admin/stats">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = statsRange({ range: one(q.range), from: one(q.from), to: one(q.to) });
  // Which sign-up page's funnel: "" = myostaz.com's home page, "*" = all pages, else a partner's.
  const data = hasDb() ? await consoleData() : null;
  const src = one(q.src) ?? "";
  const source = src === "*" || data?.partners.some((p) => p.slug === src) ? src : "";
  const [s, f, sources] = await Promise.all([platformStats(range), funnel(range.from, range.to, source), data ? sourceSummaries(data) : []]);
  const keep = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(range.preset === "custom" ? { from: range.from ?? "", to: range.to } : { range: range.preset }), ...extra })}`;
  const sourceName = source === "*" ? "كل الصفحات (المنصة والشركاء)" : source ? `صفحة ${data?.partners.find((p) => p.slug === source)?.name}` : "صفحة التجربة (myostaz.com)";

  return (
    <>
      <div className="a-head">
        <h1>الإحصائيات</h1>
        <p className="a-sub">كل المدرسين مع بعض (الموقع بس، من غير المعاينة). الأيام بتوقيت القاهرة.{s ? ` الفترة: ${s.from} → ${s.range.to}.` : ""}</p>
        <nav className="an-ranges" aria-label="الفترة">
          {(Object.keys(PRESET_LABEL) as Preset[]).map((k) => (
            <a key={k} href={`?range=${k}${source ? `&src=${source}` : ""}`} aria-current={range.preset === k ? "page" : undefined}>{PRESET_LABEL[k]}</a>
          ))}
        </nav>
        <form className="ps-dates" method="get">
          <label>من <input type="date" name="from" defaultValue={range.preset === "custom" ? range.from ?? "" : ""} required /></label>
          <label>إلى <input type="date" name="to" defaultValue={range.preset === "custom" ? range.to : ""} /></label>
          {source && <input type="hidden" name="src" value={source} />}
          <button type="submit" className={`btn-sm ${range.preset === "custom" ? "primary" : "ghost"}`}>عرض</button>
        </form>
      </div>
      {hasDb() && data && data.partners.length > 0 && (
        <nav className="an-ranges sa-sources" aria-label="الصفحة">
          {[["", "صفحة المنصة"], ...data.partners.map((p) => [p.slug, p.name]), ["*", "الكل"]].map(([k, label]) => (
            <a key={k || "_"} href={keep(k ? { src: k } : {})} aria-current={source === k ? "page" : undefined}>{label}</a>
          ))}
        </nav>
      )}
      {hasDb() && <FunnelView f={f} title={sourceName} />}
      {sources.length > 1 && <><h2 className="sa-h2">المنصة والشركاء (من البداية)</h2><SourcesTable rows={sources} now={Date.now()} /></>}
      {!hasDb() || !s ? <p className="an-empty">لا توجد قاعدة بيانات متصلة.</p> : <><h2 className="sa-h2">مواقع المدرسين</h2><PlatformStatsView s={s} /></>}
    </>
  );
}
