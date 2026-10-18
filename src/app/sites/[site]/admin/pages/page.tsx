import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { pageVisits } from "@/lib/server/analytics";
import { enumLabel } from "@/lib/admin/labels";
import { formatWhen } from "@/lib/admin/format";
import { deadline } from "@/lib/dates";
import { CopyLink } from "@/components/admin/CopyLink";
import { blockedMessage } from "@/lib/permissions";
import { updatePageAction } from "../actions";

export const metadata: Metadata = { title: "الصفحات" };

/**
 * The teacher's pages (offers, requests, information: content.pages), each with
 * its link to share, its visits, and on/off, edit and delete. Editing opens the
 * page's pop-up in «إعداد الصفحات» (/admin/edit/pages?open=pages.<n>).
 */
export default async function Pages({ params }: PageProps<"/sites/[site]/admin/pages">) {
  const site = decodeURIComponent((await params).site);
  await requireAdmin(site);
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) notFound();
  const base = baseForSite(site);
  const env = await adminEnv();
  const pages = copyFor(t, env).content.pages;
  const visits = await pageVisits(slug, env).catch(() => new Map<string, number>());
  const now = Date.now();

  return (
    <>
      <div className="a-head">
        <h1>الصفحات</h1>
        <p className="a-sub">
          صفحة لوحدها لكل عرض أو ملف أو طلب. بدل ما تحط رابط درايف تحت الفيديو، حط رابط الصفحة:
          الطالب يشوف التفاصيل والسعر ويطلب على واتساب أو بنموذج، وانت تعرف مين طلب.
        </p>
        <div className="a-actions"><a className="btn-sm primary" href={`${base}/admin/edit/pages?open=pages.new`}>+ صفحة جديدة</a></div>
      </div>
      {!t.permissions.promo && <p className="a-alert">🔒 {blockedMessage("promo")} الصفحات مش ظاهرة على الموقع.</p>}
      {pages.length === 0 && <p className="an-empty">لسه مفيش صفحات. اعمل أول صفحة من «صفحة جديدة».</p>}
      <ul className="qz-list">
        {pages.map((p, i) => {
          const ended = p.endsAt ? deadline(p.endsAt).getTime() <= now : false;
          const status = !p.enabled ? "متوقفة" : ended ? "العرض انتهى" : "شغالة";
          const n = visits.get(p.path) ?? 0;
          return (
            <li key={p.path} className="a-panel qz-item">
              <div className="qz-head">
                <span className={`rq-badge ${p.enabled && !ended ? "new" : ""}`}>{status}</span>
                <b>{p.title}</b>
                <span className="a-sub">{enumLabel(p.kind, "kind")} · {n.toLocaleString("ar-EG-u-nu-latn")} زيارة</span>
              </div>
              <CopyLink path={`${base}/${p.path}`} />
              <p className="a-sub">
                {p.cta.form ? "الزرار بيفتح نموذج (الردود في «الطلبات»)" : `الزرار: ${p.cta.label}`}
                {p.price ? ` · السعر ${p.price}` : ""}
                {p.endsAt ? ` · ${ended ? "انتهى" : "ينتهي"} ${formatWhen(deadline(p.endsAt).toISOString())}` : ""}
              </p>
              <div className="qz-actions">
                <form action={updatePageAction.bind(null, site, p.path, p.enabled ? "off" : "on", env)}>
                  <button type="submit" className={`btn-sm ${p.enabled ? "ghost" : "primary"}`}>{p.enabled ? "أوقف الصفحة" : "شغّل الصفحة"}</button>
                </form>
                <a className="btn-sm ghost" href={`${base}/admin/edit/pages?open=pages.${i}`}>تعديل</a>
                {p.enabled && <a className="btn-sm ghost" href={`${base}/${p.path}`} target="_blank" rel="noopener">افتح الصفحة</a>}
                <details className="a-confirm">
                  <summary className="f-link danger">حذف</summary>
                  <form action={updatePageAction.bind(null, site, p.path, "delete", env)}>
                    <p className="a-sub">هتتمسح الصفحة «{p.title}» والرابط هيبطل يفتح. الزيارات القديمة مش هتظهر تاني.</p>
                    <button type="submit" className="btn-sm danger">أيوه، احذف</button>
                  </form>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
