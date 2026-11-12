import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { REVISION_DAYS, getTenant, listRevisions } from "@/lib/server/repo";
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
        <h1>سجل التعديلات</h1>
        <p className="a-sub">كل حفظ يحتفظ بنسخة كاملة لمدة {REVISION_DAYS} أيام، سواء على الموقع أو في المعاينة، وبعدها النسخة بتتمسح نهائياً. الاسترجاع ينشئ نسخة جديدة: نسخة الموقع ترجع للموقع، ونسخة المعاينة ترجع للمعاينة.</p>
      </div>
      <ol className="a-history">
        {revisions.map((r) => (
          <li key={r.id}>
            <div>
              <strong>النسخة {r.version}</strong>
              <span className={`a-chip${r.env === "production" ? " prod" : ""}`}>{r.env === "production" ? "الموقع" : "المعاينة"}</span> · {r.note ?? "تعديل"}
              <span className="a-sub"> — {r.author}، {formatWhen(r.createdAt)}</span>
              {r.startingPoint && <span className="a-sub"> · شكل {r.env === "production" ? "الموقع" : "المعاينة"} من قبل آخر {REVISION_DAYS} أيام</span>}
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
      {revisions.length === 0 && <p>لا توجد تعديلات في آخر {REVISION_DAYS} أيام.</p>}
    </>
  );
}
