import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasDb } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { RANGES, report, type RangeT } from "@/lib/server/analytics";
import { AnalyticsView } from "@/components/admin/AnalyticsView";

export const metadata: Metadata = { title: "الإحصائيات" };

const RANGE_LABEL: Record<RangeT, string> = { today: "النهاردة", month: "الشهر ده", lastMonth: "الشهر اللي فات", all: "من البداية" };

export default async function Analytics({ params, searchParams }: PageProps<"/sites/[site]/admin/analytics">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  if (!slug) notFound();
  const t = await getTenant(slug);
  if (!t) notFound();
  const q = (await searchParams).range;
  const range: RangeT = RANGES.includes(q as RangeT) ? (q as RangeT) : "month";
  const r = await report(slug, range);
  const base = baseForSite(site);

  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>الإحصائيات</h1>
        <p className="a-sub">زيارات موقع {t.name} والضغط على أزرار التواصل. الأيام بتوقيت القاهرة، والأرقام بتتحدث لحظياً.</p>
        <nav className="an-ranges" aria-label="الفترة">
          {RANGES.map((k) => (
            <a key={k} href={`?range=${k}`} aria-current={k === range ? "page" : undefined}>{RANGE_LABEL[k]}</a>
          ))}
        </nav>
      </div>
      {!hasDb() || !r ? (
        <div className="a-alert">الإحصائيات محتاجة قاعدة بيانات متصلة (DATABASE_URL).</div>
      ) : (
        <>
          <AnalyticsView r={r} sectionOrder={t.content.sections} />
          <p className="a-sub an-foot">
            بدون كوكيز وبدون بيانات شخصية: الزائر هو الجهاز/المتصفح (نفس الطالب على موبايل وكمبيوتر يُحسب مرتين).
            زياراتك أنت من أي متصفح فتح لوحة التحكم مش بتتحسب. مانعات الإعلانات نادراً ما تمنعها لأنها على نفس الدومين.
          </p>
        </>
      )}
    </>
  );
}
