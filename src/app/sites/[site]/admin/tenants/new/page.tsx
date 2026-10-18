import { notFound } from "next/navigation";
import { requireSuper } from "@/lib/server/auth";
import { listTenants } from "@/lib/server/repo";
import { createTenantAction } from "../../actions";
import { ActionForm } from "@/components/admin/ConsoleForms";

export default async function NewTenant({ params }: PageProps<"/sites/[site]/admin/tenants/new">) {
  const site = decodeURIComponent((await params).site);
  if (site !== "_platform") notFound();
  await requireSuper(site);
  const tenants = await listTenants();
  return (
    <>
      <div className="a-head">
        <a className="a-back" href="/admin/tenants">→ المدرسين</a>
        <h1>مدرس جديد</h1>
        <p className="a-sub">ابدأ بمحتوى جاهز (كل أقسام الموقع بمحتوى تجريبي: مواعيد، امتحانات، اختبار، تصويت، رابط شريك...) أو انسخ مدرس موجود، ثم عدّل من لوحة التحكم.</p>
      </div>
      <ActionForm action={createTenantAction} submit="إنشاء">
        <label className="f-field"><span className="f-label">اسم المدرس</span><input name="name" required placeholder="مستر أحمد حسن" /></label>
        <label className="f-field"><span className="f-label">المعرّف (يظهر في الروابط)</span><input name="slug" required dir="ltr" pattern="[a-z0-9\-]+" placeholder="ahmed-hassan" /></label>
        <label className="f-field"><span className="f-label">نسخ القالب من</span>
          <select name="source" required defaultValue="demo:ar-EG">
            <optgroup label="محتوى جاهز">
              <option value="demo:ar-EG">محتوى جاهز (عربي)</option>
              <option value="demo:en">محتوى جاهز (English)</option>
            </optgroup>
            <optgroup label="نسخ مدرس موجود">
              {tenants.map((t) => <option key={t.slug} value={`tenant:${t.slug}`}>{t.name}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="f-field"><span className="f-label">المادة (للمحتوى الجاهز)</span><input name="subject" placeholder="الفيزياء" /></label>
        <label className="f-field"><span className="f-label">رقم الواتساب (للمحتوى الجاهز، اختياري)</span><input name="phone" dir="ltr" inputMode="tel" placeholder="01012345678" /></label>
      </ActionForm>
    </>
  );
}
