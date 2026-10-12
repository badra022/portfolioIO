import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasDb } from "@/lib/env";
import { requireSuper } from "@/lib/server/auth";
import { platformStats, statsRange, type Preset } from "@/lib/server/platform-stats";
import { PlatformStatsView } from "@/components/admin/PlatformStatsView";

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
  const s = await platformStats(range);

  return (
    <>
      <div className="a-head">
        <a className="a-back" href="/admin">→ المدرسين</a>
        <h1>الإحصائيات العامة</h1>
        <p className="a-sub">كل المدرسين مع بعض (الموقع بس، من غير المعاينة). الأيام بتوقيت القاهرة.{s ? ` الفترة: ${s.from} → ${s.range.to}.` : ""}</p>
        <nav className="an-ranges" aria-label="الفترة">
          {(Object.keys(PRESET_LABEL) as Preset[]).map((k) => (
            <a key={k} href={`?range=${k}`} aria-current={range.preset === k ? "page" : undefined}>{PRESET_LABEL[k]}</a>
          ))}
        </nav>
        <form className="ps-dates" method="get">
          <label>من <input type="date" name="from" defaultValue={range.preset === "custom" ? range.from ?? "" : ""} required /></label>
          <label>إلى <input type="date" name="to" defaultValue={range.preset === "custom" ? range.to : ""} /></label>
          <button type="submit" className={`btn-sm ${range.preset === "custom" ? "primary" : "ghost"}`}>عرض</button>
        </form>
      </div>
      {!hasDb() || !s ? <p className="an-empty">لا توجد قاعدة بيانات متصلة.</p> : <PlatformStatsView s={s} />}
    </>
  );
}
