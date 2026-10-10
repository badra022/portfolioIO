import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant, listRevisions } from "@/lib/server/repo";
import { formatWhen } from "@/lib/admin/format";
import { restoreRevisionAction } from "../actions";

export default async function History({ params }: PageProps<"/sites/[site]/admin/history">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  if (!slug) notFound();
  const [t, revisions] = await Promise.all([getTenant(slug), listRevisions(slug)]);
  if (!t) notFound();
  const base = baseForSite(site);
  return (
    <>
      <div className="a-head">
        <a className="a-back" href={`${base}/admin`}>→ كل الأقسام</a>
        <h1>سجل التعديلات</h1>
        <p className="a-sub">كل حفظ يحتفظ بنسخة كاملة، سواء على الموقع أو في المعاينة. الاسترجاع ينشئ نسخة جديدة ولا يحذف شيئاً: نسخة الموقع ترجع للموقع، ونسخة المعاينة ترجع للمعاينة.</p>
      </div>
      <ol className="a-history">
        {revisions.map((r) => (
          <li key={r.id}>
            <div>
              <strong>النسخة {r.version}</strong>
              <span className={`a-chip${r.env === "production" ? " prod" : ""}`}>{r.env === "production" ? "الموقع" : "المعاينة"}</span> · {r.note ?? "تعديل"}
              <span className="a-sub"> — {r.author}، {formatWhen(r.createdAt)}</span>
            </div>
            {r.version === (r.env === "production" ? t.version : t.preview.version) ? (
              <span className="a-badge">الحالية</span>
            ) : (
              <details className="a-confirm">
                <summary className="btn-sm ghost">استرجاع</summary>
                <form action={restoreRevisionAction.bind(null, site, r.id)}>
                  <p>{r.env === "production" ? `سيرجع الموقع كما كان في النسخة ${r.version}.` : `سترجع المعاينة كما كانت في النسخة ${r.version} (الموقع مش هيتغير).`}</p>
                  <button type="submit" className="btn-sm primary">تأكيد الاسترجاع</button>
                </form>
              </details>
            )}
          </li>
        ))}
      </ol>
      {revisions.length === 0 && <p>لا توجد تعديلات بعد.</p>}
    </>
  );
}
