import { listBundled } from "@/lib/server/bundled";
import { listTenants } from "@/lib/server/repo";
import { importBundledAction } from "@/app/sites/[site]/admin/actions";
import { formatWhen } from "@/lib/admin/format";
import { ActionForm } from "./ConsoleForms";

/** Super-admin home on the platform host: every teacher, plus import from the repo. */
export async function PlatformConsole() {
  const [tenants, bundled] = await Promise.all([listTenants(), Promise.resolve(listBundled())]);
  return (
    <>
      <div className="a-head">
        <h1>المدرسين</h1>
        <div className="a-actions">
          <a className="btn-sm primary" href="/admin/tenants/new">+ مدرس جديد</a>
        </div>
      </div>
      <table className="a-table">
        <thead><tr><th>المدرس</th><th>الدومين</th><th>الحالة</th><th>حسابات</th><th>آخر تعديل</th><th></th></tr></thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.slug}>
              <td><strong>{t.name}</strong><br /><code dir="ltr">{t.slug}</code></td>
              <td dir="ltr">{t.domains.map((d) => <div key={d.domain}>{d.domain}{d.isPrimary ? " ★" : ""}</div>)}{t.domains.length === 0 && "—"}</td>
              <td>{t.status === "active" ? "منشور" : "متوقف"}</td>
              <td>{t.users}</td>
              <td>{t.updatedAt ? formatWhen(t.updatedAt) : "—"}</td>
              <td className="a-row-actions">
                <a href={`/t/${t.slug}`} target="_blank" rel="noopener">معاينة</a>
                <a href={`/t/${t.slug}/admin`}>تعديل المحتوى</a>
                <a href={`/admin/tenants/${t.slug}`}>إدارة</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tenants.length === 0 && <p>لا يوجد مدرسين بعد. استورد المدرسين من المستودع بالأسفل.</p>}

      <section className="a-panel">
        <h2>استيراد من المستودع</h2>
        <p className="a-sub">ينسخ المدرسين من مجلد <code>tenants/</code> ({bundled.join("، ") || "لا يوجد"}) إلى قاعدة البيانات، ويرفع صورهم إلى التخزين.</p>
        <ActionForm action={importBundledAction} submit="استيراد">
          <label className="f-check"><input type="checkbox" name="overwrite" /> استبدال بيانات المدرسين الموجودين بالفعل</label>
        </ActionForm>
      </section>
    </>
  );
}
