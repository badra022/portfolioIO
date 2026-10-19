import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { consoleData, sourceSummaries } from "@/lib/server/console";
import { ActionForm } from "@/components/admin/ConsoleForms";
import { SourcesTable } from "@/components/admin/SourcesTable";
import { createPartnerAction } from "./actions";

export const metadata: Metadata = { title: "الشركاء" };

/**
 * Super admin, platform host: the partners (marketing agencies). Each has a
 * private page at <platform>/<slug> behind its own login that builds unlimited
 * trial sites, and manages the sites that belong to it.
 */
export default async function Partners({ params }: PageProps<"/sites/[site]/admin/partners">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const data = await consoleData();
  const rows = await sourceSummaries(data);
  return (
    <>
      <div className="a-head">
        <h1>الشركاء</h1>
        <p className="a-sub">وكالات التسويق اللي بتشتغل معاك: كل شريك ليه صفحة خاصة بحسابه بيعمل منها مواقع تجريبية لعملائه من غير حد، وبيدير مواقعهم بنفس الحساب. الأرقام هنا مقسّمة لكل شريك، وصفحة المنصة لوحدها.</p>
      </div>

      <h2 className="sa-h2">كل المصادر</h2>
      <SourcesTable rows={rows} now={Date.now()} />

      <section className="a-panel sa-new-partner">
        <h2>+ شريك جديد</h2>
        <ActionForm action={createPartnerAction} submit="إضافة الشريك">
          <label className="f-field"><span className="f-label">اسم الشريك</span><input name="name" required maxLength={80} placeholder="وكالة تيتشر أون" /></label>
          <label className="f-field"><span className="f-label">عنوان صفحته</span>
            <span className="pf-slug" dir="ltr"><i>myostaz.com/</i><input name="slug" required pattern="[a-z0-9\-]{3,40}" placeholder="teacheron" autoCapitalize="none" /></span>
          </label>
          <div className="pf-row">
            <label className="f-field grow"><span className="f-label">اسم المستخدم</span><input name="username" required dir="ltr" pattern="[a-z0-9._\-]{3,32}" placeholder="teacheron" autoCapitalize="none" /></label>
            <label className="f-field grow"><span className="f-label">كلمة السر (فاضية = نعملها إحنا)</span><input name="password" type="text" dir="ltr" minLength={8} autoComplete="off" /></label>
          </div>
          <label className="f-field"><span className="f-label">مدة المواقع التجريبية (ساعات)</span><input name="trialHours" type="number" min={1} max={720} defaultValue={72} required /></label>
          <label className="f-field"><span className="f-label">ملاحظات ليك (اختياري)</span><textarea name="notes" rows={2} maxLength={2000} placeholder="الاتفاق، نسبة الاشتراك، رقم المسؤول…" /></label>
        </ActionForm>
      </section>
    </>
  );
}
