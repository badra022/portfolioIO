import { listBundled } from "@/lib/server/bundled";
import { listTenants } from "@/lib/server/repo";
import { overview } from "@/lib/server/analytics";
import { importBundledAction } from "@/app/sites/[site]/admin/actions";
import { formatWhen } from "@/lib/admin/format";
import { ActionForm } from "./ConsoleForms";

/** Super-admin home on the platform host: every teacher, plus import from the repo. */
export async function PlatformConsole() {
  const [tenants, bundled, stats] = await Promise.all([listTenants(), Promise.resolve(listBundled()), overview()]);
  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
  const total = stats.reduce((a, s) => ({ visitors: a.visitors + s.visitors, contacts: a.contacts + s.contacts, all: a.all + s.allTimeVisitors }), { visitors: 0, contacts: 0, all: 0 });
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

      {stats.length > 0 && (
        <section className="a-panel">
          <h2>الإحصائيات</h2>
          <p className="a-sub">
            الشهر ده: <b>{fmt(total.visitors)}</b> زائر لكل المدرسين، منهم <b>{fmt(total.contacts)}</b> تواصلوا
            ({total.visitors ? Math.round((total.contacts / total.visitors) * 1000) / 10 : 0}%). من البداية: <b>{fmt(total.all)}</b> زائر.
          </p>
          <table className="a-table">
            <thead><tr><th>المدرس</th><th>زوار الشهر</th><th>مشاهدات الشهر</th><th>تواصلوا</th><th>زوار من البداية</th><th></th></tr></thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.slug}>
                  <td><strong>{s.name}</strong></td>
                  <td>{fmt(s.visitors)}</td>
                  <td>{fmt(s.views)}</td>
                  <td>{fmt(s.contacts)} <span className="a-sub">({s.visitors ? Math.round((s.contacts / s.visitors) * 1000) / 10 : 0}%)</span></td>
                  <td>{fmt(s.allTimeVisitors)}</td>
                  <td className="a-row-actions"><a href={`/t/${s.slug}/admin/analytics`}>التفاصيل</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
