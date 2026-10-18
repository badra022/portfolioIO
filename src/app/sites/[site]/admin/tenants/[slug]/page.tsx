import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { requireSuper } from "@/lib/server/auth";
import { getTenant, listTrialRequests, listUsers } from "@/lib/server/repo";
import { overview } from "@/lib/server/analytics";
import { adminCounts } from "@/lib/server/admin-counts";
import { siteAddress } from "@/lib/server/console";
import { STATE_LABEL, fromNow, tenantState } from "@/lib/admin/tenant-actions";
import { formatWhen } from "@/lib/admin/format";
import {
  addDomainAction, createUserAction, deleteUserAction, primaryDomainAction, removeDomainAction,
  resetPasswordAction, setStatusAction, setTrialAction, setUserDisabledAction, putSiteFilesAction, deleteSiteFileAction, setPermissionsAction,
  deleteTenantAction, tenantsAction,
} from "../../actions";
import { listSiteFiles } from "@/lib/server/site-files";
import { ActionForm } from "@/components/admin/ConsoleForms";
import { FEATURES, FEATURE_INFO } from "@/lib/permissions";

export default async function ManageTenant({ params }: PageProps<"/sites/[site]/admin/tenants/[slug]">) {
  const { site: raw, slug } = await params;
  const site = decodeURIComponent(raw);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  await connection();
  const [t, users, files, stats, leads] = await Promise.all([
    getTenant(slug), listUsers(slug), listSiteFiles(slug), overview().catch(() => []), listTrialRequests().catch(() => []),
  ]);
  if (!t) notFound();
  const counts = await adminCounts(t, "production").catch(() => ({ requests: 0, grading: 0, complaints: 0 }));
  const st = stats.find((s) => s.slug === t.slug);
  const lead = leads.find((l) => l.slug === t.slug);
  const state = tenantState(t);
  const address = siteAddress(t.slug, t.domains);
  const num = (v: number) => v.toLocaleString("en-US");
  const active = t.status === "active";
  // Where the files are visible: the main domain, else the preview address on this host.
  const primary = t.domains.find((d) => d.isPrimary)?.domain ?? t.domains[0]?.domain;
  const siteBase = primary ? `https://${primary}` : null;

  return (
    <>
      <div className="a-head">
        <a className="a-back" href="/admin/tenants">→ المدرسين</a>
        <h1>{t.name}</h1>
        <p className="a-sub">
          <span className={`sa-state ${state}`}>{STATE_LABEL[state]}</span>{" "}
          {t.trialEndsAt && state !== "off" && <>{fromNow(t.trialEndsAt)} · </>}
          <a dir="ltr" href={address.url} target="_blank" rel="noopener">{address.label}</a> · <code dir="ltr">{t.slug}</code>
        </p>
        <div className="a-actions">
          <a className="btn-sm ghost" href={address.url} target="_blank" rel="noopener">افتح الموقع ↗</a>
          <a className="btn-sm ghost" href={`/t/${t.slug}/admin`}>لوحة تحكم المدرس</a>
          <a className="btn-sm ghost" href={`/t/${t.slug}/admin/analytics`}>إحصائياته</a>
          <form action={setStatusAction.bind(null, t.slug, active ? "disabled" : "active")}>
            <button className={`btn-sm ${active ? "ghost danger" : "primary"}`}>{active ? "إيقاف الموقع" : "تشغيل الموقع"}</button>
          </form>
        </div>
      </div>

      <section className="sa-kpis" aria-label="أرقام المدرس">
        <div className="sa-kpi"><b className="num">{num(st?.visitors ?? 0)}</b><span>زوار الشهر</span></div>
        <div className="sa-kpi"><b className="num">{num(st?.contacts ?? 0)}</b><span>تواصلوا الشهر ده</span></div>
        <div className="sa-kpi"><b className="num">{num(st?.allTimeVisitors ?? 0)}</b><span>زوار من البداية</span></div>
        <div className="sa-kpi"><b className="num">{num(counts.requests)}</b><span>طلبات جديدة</span></div>
        <div className="sa-kpi"><b className="num">{num(users.length)}</b><span>حسابات</span></div>
      </section>

      {lead && (
        <section className="a-panel">
          <h2>طلب التجربة</h2>
          <p className="a-sub">
            اتطلب {fromNow(lead.createdAt)} · {lead.subject ?? ""}
            {lead.phone && <> · <a dir="ltr" href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener">+{lead.phone}</a></>}
          </p>
          {lead.notes ? <blockquote className="sa-quote">{lead.notes}</blockquote> : <p className="a-sub">من غير ملاحظات.</p>}
        </section>
      )}

      {t.trialEndsAt && (
        <section className={`a-panel a-trial ${Date.parse(t.trialEndsAt) <= Date.now() ? "over" : ""}`}>
          <h2>تجربة مجانية</h2>
          <p className="a-sub">
            {Date.parse(t.trialEndsAt) <= Date.now()
              ? <>انتهت {formatWhen(t.trialEndsAt)}. الموقع بيظهر «الفترة التجريبية انتهت» ودخول المدرس متوقف.</>
              : <>بتنتهي {formatWhen(t.trialEndsAt)}. بعدها الموقع يقف ودخول المدرس يتقفل لحد ما تفعّله.</>}
          </p>
          <div className="a-actions">
            <form action={setTrialAction.bind(null, t.slug, "activate")}><button className="btn-sm primary">تفعيل الموقع (إلغاء التجربة)</button></form>
            <form action={setTrialAction.bind(null, t.slug, "extend")}><button className="btn-sm ghost">مدّ التجربة 24 ساعة</button></form>
            {Date.parse(t.trialEndsAt) > Date.now() && (
              <form action={async () => { "use server"; await tenantsAction([t.slug], "end"); }}><button className="btn-sm ghost danger">إنهاء التجربة الآن</button></form>
            )}
          </div>
        </section>
      )}

      <section className="a-panel">
        <h2>الباقة (الصلاحيات)</h2>
        <p className="a-sub">
          الخاصية المقفولة: المدرس يقدر يجهّزها ويحفظها في المعاينة بس مش يحفظها أو ينشرها على الموقع، وبتختفي من الموقع على طول.
          صفحات الإحصائيات والطلبات بتظهر رسالة بدل البيانات. ده بيتطبق على أي حد بيعدّل الموقع، حتى حسابك.
        </p>
        <ActionForm action={setPermissionsAction.bind(null, t.slug)} submit="حفظ الباقة" className="a-form">
          <div className="perm-list">
            {FEATURES.map((f) => (
              <label key={f} className="perm">
                <input type="checkbox" name={f} defaultChecked={t.permissions[f]} />
                <span><b>{FEATURE_INFO[f].title}</b><small>{FEATURE_INFO[f].description}</small></span>
              </label>
            ))}
          </div>
          <label className="f-field perm-max">
            <span className="f-label">أقصى عدد نماذج <em className="f-opt">(فاضي = من غير حد)</em></span>
            <input type="number" name="maxForms" min={0} max={100} defaultValue={t.permissions.maxForms ?? ""} placeholder="مثلاً 3" />
          </label>
        </ActionForm>
      </section>

      <section className="a-panel">
        <h2>الدومينات</h2>
        <p className="a-sub">
          بعد إضافة الدومين هنا أضفه أيضاً في Vercel (Project → Settings → Domains) واضبط الـ DNS عند شركة الدومين.
          {env.rootDomain && <> العنوان المجاني: <code dir="ltr">{t.slug}.{env.rootDomain}</code></>}
        </p>
        <ul className="a-list">
          {t.domains.map((d) => (
            <li key={d.domain}>
              <a dir="ltr" href={`https://${d.domain}`} target="_blank" rel="noopener">{d.domain}</a>
              {d.isPrimary ? <span className="a-badge">الأساسي (لجوجل)</span> : (
                <form action={primaryDomainAction.bind(null, t.slug, d.domain)}><button className="f-link">جعله الأساسي</button></form>
              )}
              <form action={removeDomainAction.bind(null, t.slug, d.domain)}><button className="f-link danger">حذف</button></form>
            </li>
          ))}
        </ul>
        <ActionForm action={addDomainAction.bind(null, t.slug)} submit="إضافة دومين" className="a-form inline">
          <input name="domain" dir="ltr" placeholder="mohamedali.com" required />
        </ActionForm>
      </section>

      <section className="a-panel">
        <h2>حسابات المدرس</h2>
        <p className="a-sub">كل حساب يقدر يعدّل موقع هذا المدرس فقط، من <code dir="ltr">/admin</code> على دومينه. لو دخل من لوحة المنصة بحسابه بيتحوّل لموقعه تلقائياً.</p>
        <ul className="a-list">
          {users.map((u) => (
            <li key={u.id}>
              <code dir="ltr">{u.username}</code>
              {u.disabled && <span className="a-badge">معطّل</span>}
              <span className="a-sub">{u.lastLoginAt ? `آخر دخول ${formatWhen(u.lastLoginAt)}` : "لم يدخل بعد"}</span>
              <ActionForm action={resetPasswordAction.bind(null, t.slug, u.id, u.username)} submit="كلمة مرور جديدة" className="a-form bare" />
              <form action={setUserDisabledAction.bind(null, t.slug, u.id, !u.disabled)}><button className="f-link">{u.disabled ? "تفعيل" : "تعطيل"}</button></form>
              <form action={deleteUserAction.bind(null, t.slug, u.id)}><button className="f-link danger">حذف</button></form>
            </li>
          ))}
        </ul>
        <ActionForm action={createUserAction.bind(null, t.slug)} submit="إنشاء حساب" className="a-form inline">
          <input name="username" dir="ltr" placeholder="mohamed" required pattern="[a-z0-9._\-]{3,32}" />
        </ActionForm>
      </section>

      <section className="a-panel">
        <h2>ملفات الموقع</h2>
        <p className="a-sub">
          ملفات نصية صغيرة بتظهر على جذر موقع المدرس: ملف التحقق من Google Search Console أو Bing، ads.txt، أو ملفات .well-known.
          ارفع الملف زي ما نزل من جوجل، أو اكتب اسمه ومحتواه.
        </p>
        <ul className="a-list">
          {files.map((f) => {
            const where = siteBase ? `${siteBase}/${f.name}` : `/t/${t.slug}/${f.name}`;
            return (
              <li key={f.name}>
                <a dir="ltr" href={where} target="_blank" rel="noopener"><code>/{f.name}</code></a>
                <span className="a-sub">{f.size} بايت · {formatWhen(f.updatedAt)}</span>
                <form action={deleteSiteFileAction.bind(null, t.slug, f.name)}><button className="f-link danger">حذف</button></form>
              </li>
            );
          })}
        </ul>
        {files.length === 0 && <p className="a-sub">مفيش ملفات.</p>}
        <ActionForm action={putSiteFilesAction.bind(null, t.slug)} submit="حفظ" className="a-form">
          <input type="file" name="files" multiple accept=".html,.htm,.txt,.xml,.json,text/*" />
          <details className="a-confirm">
            <summary className="f-link">أو اكتب الاسم والمحتوى</summary>
            <div className="a-form">
              <input name="name" dir="ltr" placeholder="google1234567890abcdef.html" />
              <textarea name="content" dir="ltr" rows={3} placeholder="google-site-verification: google1234567890abcdef.html" />
            </div>
          </details>
        </ActionForm>
      </section>
      <section className="a-panel sa-danger">
        <h2>حذف المدرس</h2>
        <p className="a-sub">نهائي: الموقع والحسابات والدومينات والطلبات والاختبارات والإحصائيات والصور هتتمسح ومش هترجع. طلب التجربة (لو موجود) بيفضل في «طلبات التجربة». لو كان ليه دومين في Vercel امسحه من هناك كمان.</p>
        <details className="a-confirm">
          <summary className="btn-sm danger">حذف {t.name}</summary>
          <form action={deleteTenantAction.bind(null, t.slug)} className="a-form inline">
            <label className="f-field"><span className="f-label">اكتب «حذف» للتأكيد</span><input name="confirm" required pattern="حذف" autoComplete="off" /></label>
            <button type="submit" className="btn-sm danger">احذف نهائياً</button>
          </form>
        </details>
      </section>
    </>
  );
}
