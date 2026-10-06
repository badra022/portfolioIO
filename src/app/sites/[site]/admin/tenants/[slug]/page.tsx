import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { requireSuper } from "@/lib/server/auth";
import { getTenant, listUsers } from "@/lib/server/repo";
import { formatWhen } from "@/lib/admin/format";
import {
  addDomainAction, createUserAction, deleteUserAction, primaryDomainAction, removeDomainAction,
  resetPasswordAction, setStatusAction, setUserDisabledAction,
} from "../../actions";
import { ActionForm } from "@/components/admin/ConsoleForms";

export default async function ManageTenant({ params }: PageProps<"/sites/[site]/admin/tenants/[slug]">) {
  const { site: raw, slug } = await params;
  const site = decodeURIComponent(raw);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  const [t, users] = await Promise.all([getTenant(slug), listUsers(slug)]);
  if (!t) notFound();
  const active = t.status === "active";

  return (
    <>
      <div className="a-head">
        <a className="a-back" href="/admin">→ المدرسين</a>
        <h1>{t.name}</h1>
        <p className="a-sub"><code dir="ltr">{t.slug}</code> · {active ? "منشور" : "متوقف"}</p>
        <div className="a-actions">
          <a className="btn-sm ghost" href={`/t/${t.slug}`} target="_blank" rel="noopener">معاينة</a>
          <a className="btn-sm ghost" href={`/t/${t.slug}/admin`}>تعديل المحتوى</a>
          <form action={setStatusAction.bind(null, t.slug, active ? "disabled" : "active")}>
            <button className={`btn-sm ${active ? "ghost danger" : "primary"}`}>{active ? "إيقاف الموقع" : "تشغيل الموقع"}</button>
          </form>
        </div>
      </div>

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
    </>
  );
}
