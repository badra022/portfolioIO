import { baseForSite } from "@/lib/routing";
import { SECTIONS } from "@/lib/admin/sections";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { PlatformConsole } from "@/components/admin/PlatformConsole";
import { formatWhen } from "@/lib/admin/format";
import { countNew } from "@/lib/server/submissions";

export default async function AdminHome({ params }: PageProps<"/sites/[site]/admin">) {
  const site = decodeURIComponent((await params).site);
  const p = await requireAdmin(site);
  if (site === "_platform") return <PlatformConsole />;

  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!t) return <p>لا يوجد مدرس على هذا العنوان.</p>;
  const base = baseForSite(site);
  const newRequests = await countNew(slug!);
  const sections = SECTIONS.filter((s) => !s.superOnly || p.kind === "super");

  return (
    <>
      <div className="a-head">
        <h1>{t.name}</h1>
        <p className="a-sub">
          النسخة {t.version}
          {t.updatedAt && <> · آخر تعديل {formatWhen(t.updatedAt)}{t.updatedBy && <> بواسطة {t.updatedBy}</>}</>}
        </p>
        <div className="a-actions">
          <a className="btn-sm ghost" href={`${base}/`} target="_blank" rel="noopener">عرض الموقع</a>
          <a className="btn-sm primary" href={`${base}/admin/requests`}>الطلبات{newRequests > 0 && <span className="a-count">{newRequests}</span>}</a>
          <a className="btn-sm primary" href={`${base}/admin/analytics`}>الإحصائيات</a>
          <a className="btn-sm ghost" href={`${base}/admin/history`}>سجل التعديلات</a>
        </div>
      </div>
      <ul className="a-cards">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`${base}/admin/edit/${s.id}`}>
              <strong>{s.title}</strong>
              <span>{s.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
