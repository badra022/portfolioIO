import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireSuper } from "@/lib/server/auth";
import { consoleData, sourceSummaries, trialLeads } from "@/lib/server/console";
import { getPartner } from "@/lib/server/partners";
import { funnel } from "@/lib/server/funnel";
import { cairoDay } from "@/lib/analytics";
import { fromNow } from "@/lib/admin/tenant-actions";
import { ActionForm } from "@/components/admin/ConsoleForms";
import { FunnelView } from "@/components/admin/FunnelView";
import { TrialsTable } from "@/components/admin/TrialsTable";
import { TenantsTable } from "@/components/admin/TenantsTable";
import { PartnerFormEditor } from "@/components/admin/PartnerFormEditor";
import { deletePartnerAction, partnerPasswordAction, updatePartnerAction } from "../actions";

export const metadata: Metadata = { title: "شريك" };

const n = (v: number) => v.toLocaleString("en-US");

/** One partner: its numbers, its page's funnel, its trial requests and sites, its login, and its form. */
export default async function PartnerPage({ params }: PageProps<"/sites/[site]/admin/partners/[slug]">) {
  const { site: raw, slug } = await params;
  const site = decodeURIComponent(raw);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const p = await getPartner(decodeURIComponent(slug));
  if (!p) notFound();
  const now = Date.now();
  const data = await consoleData();
  const [summary] = (await sourceSummaries(data)).filter((s) => s.source === p.slug);
  const leads = trialLeads(data.rows, data.trials, data.partners, now).filter((l) => l.partner?.slug === p.slug);
  const sites = data.rows.filter((r) => r.partner?.slug === p.slug);
  const f = await funnel(null, cairoDay(new Date()), p.slug);

  return (
    <>
      <div className="a-head">
        <a className="a-back" href="/admin/partners">→ الشركاء</a>
        <h1>{p.name}</h1>
        <p className="a-sub">
          {p.disabled ? <span className="sa-state off">متوقف</span> : <span className="sa-state live">شغال</span>}{" "}
          <a dir="ltr" href={`/${p.slug}`} target="_blank" rel="noopener">myostaz.com/{p.slug}</a> · دخول بـ <code dir="ltr">{p.username}</code>
          {" · "}{p.lastLoginAt ? `آخر دخول ${fromNow(p.lastLoginAt, now)}` : "لسه مدخلش"} · التجربة {p.trialHours} ساعة
        </p>
        <div className="a-actions">
          <a className="btn-sm ghost" href={`/${p.slug}`} target="_blank" rel="noopener">افتح صفحته ↗</a>
          <a className="btn-sm ghost" href={`/admin/trials/export?partner=${p.slug}`}>طلباته Excel (CSV)</a>
        </div>
      </div>

      {summary && (
        <section className="sa-kpis" aria-label="أرقامه">
          <div className="sa-kpi"><b className="num">{n(summary.views)}</b><span>زيارات صفحته</span></div>
          <div className="sa-kpi"><b className="num">{n(summary.trials)}</b><span>طلبات تجربة</span></div>
          <div className="sa-kpi trial"><b className="num">{n(summary.running)}</b><span>تجارب شغالة</span></div>
          <div className="sa-kpi over"><b className="num">{n(summary.ended)}</b><span>تجارب انتهت</span></div>
          <div className="sa-kpi ok"><b className="num">{n(summary.activated)}</b><span>اتفعّلت</span></div>
          <div className="sa-kpi"><b className="num">{n(summary.visitors)}</b><span>زوار مواقعه (الشهر)</span></div>
          <div className="sa-kpi"><b className="num">{n(summary.contacts)}</b><span>تواصلوا (الشهر)</span></div>
        </section>
      )}

      <FunnelView f={f} title={`صفحة ${p.name} (من البداية)`} />

      <section className="a-panel">
        <h2>طلبات التجربة من صفحته</h2>
        <TrialsTable leads={leads} now={now} hidePartner />
      </section>

      <section className="a-panel">
        <h2>مواقعه ({n(sites.length)})</h2>
        <p className="a-sub">المواقع اللي تبعه: حسابه بيدخل لوحة تحكم أي واحد فيهم. تقدر تضيف موقع موجود من صفحة المدرس (الشريك).</p>
        <TenantsTable rows={sites} now={now} />
      </section>

      <section className="a-panel">
        <h2>فورم صفحته</h2>
        <PartnerFormEditor id={p.id} value={p.form} pageUrl={`/${p.slug}`} />
      </section>

      <div className="sa-grid">
        <section className="a-panel">
          <h2>البيانات</h2>
          <ActionForm action={updatePartnerAction.bind(null, p.id)} submit="احفظ">
            <label className="f-field"><span className="f-label">الاسم</span><input name="name" required defaultValue={p.name} maxLength={80} /></label>
            <label className="f-field"><span className="f-label">عنوان صفحته</span>
              <span className="pf-slug" dir="ltr"><i>myostaz.com/</i><input name="slug" required defaultValue={p.slug} pattern="[a-z0-9\-]{3,40}" autoCapitalize="none" /></span>
            </label>
            <label className="f-field"><span className="f-label">اسم المستخدم</span><input name="username" required dir="ltr" defaultValue={p.username} pattern="[a-z0-9._\-]{3,32}" autoCapitalize="none" /></label>
            <label className="f-field"><span className="f-label">مدة المواقع التجريبية (ساعات)</span><input name="trialHours" type="number" min={1} max={720} defaultValue={p.trialHours} required /></label>
            <label className="f-field"><span className="f-label">ملاحظات ليك</span><textarea name="notes" rows={3} maxLength={2000} defaultValue={p.notes ?? ""} /></label>
            <label className="pf-check"><input type="checkbox" name="disabled" defaultChecked={p.disabled} /> وقّف الشريك (صفحته وحسابه يقفوا، ومواقعه تفضل شغالة)</label>
          </ActionForm>
        </section>
        <section className="a-panel">
          <h2>كلمة السر</h2>
          <p className="a-sub">اكتب كلمة سر جديدة، أو سيبها فاضية ونعملها إحنا. القديمة بتقف على طول.</p>
          <ActionForm action={partnerPasswordAction.bind(null, p.id)} submit="غيّر كلمة السر" className="a-form inline">
            <input name="password" type="text" dir="ltr" minLength={8} autoComplete="off" placeholder="كلمة سر جديدة (اختياري)" />
          </ActionForm>
          <details className="sa-danger">
            <summary>حذف الشريك</summary>
            <p className="a-sub">صفحته وحسابه بيتمسحوا. مواقعه وطلباته بتفضل، بس من غير شريك.</p>
            <form action={deletePartnerAction.bind(null, p.id)}><button className="btn-sm danger">احذف {p.name}</button></form>
          </details>
        </section>
      </div>
    </>
  );
}
