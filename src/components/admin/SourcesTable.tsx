import type { SourceSummary } from "@/lib/server/console";
import { fromNow } from "@/lib/admin/tenant-actions";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

/**
 * Every sign-up source side by side: the platform's home page and each partner.
 * Page numbers are all time; visitors and contacts are this month, on the sites
 * that belong to the source.
 */
export function SourcesTable({ rows, now }: { rows: SourceSummary[]; now: number }) {
  return (
    <div className="sa-table-wrap">
      <table className="a-table sa-table">
        <thead>
          <tr>
            <th>المصدر</th><th>زيارات الصفحة</th><th>مواقع اتعملت</th><th>طلبات تجربة</th><th>شغالة</th><th>انتهت</th><th>اتفعّلت</th>
            <th>مواقع تبعه</th><th>زوار الشهر</th><th>تواصلوا</th><th>آخر دخول</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source || "_"}>
              <td>
                {r.partner ? <a className="sa-name" href={`/admin/partners/${r.partner.slug}`}>{r.name}</a> : <span className="sa-name">{r.name}</span>}
                <span className="sa-meta">
                  <code dir="ltr">/{r.source}</code>
                  {r.partner?.disabled && <span className="sa-state off">متوقف</span>}
                </span>
              </td>
              <td className="num">{n(r.views)}</td>
              <td className="num">{n(r.built)} <small className="a-sub">{pct(r.built, r.views)}</small></td>
              <td className="num">{n(r.trials)}</td>
              <td className="num">{n(r.running)}</td>
              <td className="num">{n(r.ended)}</td>
              <td className="num">{n(r.activated)}</td>
              <td className="num">{r.partner ? n(r.sites) : <small className="a-sub">{n(r.sites)} من التجربة</small>}</td>
              <td className="num">{n(r.visitors)}</td>
              <td className="num">{n(r.contacts)}</td>
              <td>{r.partner ? (r.partner.lastLoginAt ? <small>{fromNow(r.partner.lastLoginAt, now)}</small> : <small className="a-sub">لسه</small>) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
