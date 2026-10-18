import { consoleData } from "@/lib/server/console";
import { funnel } from "@/lib/server/funnel";
import { overview } from "@/lib/server/analytics";
import { cairoDay } from "@/lib/analytics";
import { STATE_LABEL, fromNow } from "@/lib/admin/tenant-actions";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";

const n = (v: number) => v.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

/**
 * The super admin's home on the platform host: how many teachers and in what
 * state, the trial requests coming in, the home page's sign-ups this week, and
 * the trials that need a decision (ending soon or ended and not activated).
 */
export async function PlatformConsole() {
  await connection();
  const now = new Date();
  const week = cairoDay(new Date(now.getTime() - 6 * 86_400_000));
  const [{ rows, trials }, f, stats] = await Promise.all([consoleData(), funnel(week, cairoDay(now)), overview().catch(() => [])]);
  const by = (s: string) => rows.filter((r) => r.state === s).length;
  const since = (h: number) => trials.filter((t) => Date.parse(t.createdAt) >= now.getTime() - h * 3600_000).length;
  const visitors = stats.reduce((a, s) => a + s.visitors, 0);
  const contacts = stats.reduce((a, s) => a + s.contacts, 0);
  // Trials that need a decision: ending in the next 6 hours, or ended in the last 3 days.
  const decide = rows.filter((r) => r.trialEndsAt && r.state !== "off"
    && Date.parse(r.trialEndsAt) < now.getTime() + 6 * 3600_000 && Date.parse(r.trialEndsAt) > now.getTime() - 3 * 86_400_000);

  return (
    <>
      <div className="a-head">
        <h1>أهلاً بيك</h1>
        <p className="a-sub">ملخص المنصة النهاردة. التفاصيل في «المدرسين» و«طلبات التجربة» و«الإحصائيات».</p>
      </div>

      <section className="sa-kpis" aria-label="المدرسين">
        <a className="sa-kpi" href="/admin/tenants"><Icon name="users" /><b className="num">{n(rows.length)}</b><span>كل المدرسين</span></a>
        <a className="sa-kpi ok" href="/admin/tenants"><b className="num">{n(by("live"))}</b><span>{STATE_LABEL.live}</span></a>
        <a className="sa-kpi trial" href="/admin/tenants"><b className="num">{n(by("trial"))}</b><span>{STATE_LABEL.trial}</span></a>
        <a className="sa-kpi over" href="/admin/tenants"><b className="num">{n(by("trialOver"))}</b><span>{STATE_LABEL.trialOver}</span></a>
        <a className="sa-kpi off" href="/admin/tenants"><b className="num">{n(by("off"))}</b><span>{STATE_LABEL.off}</span></a>
      </section>

      <div className="sa-grid">
        <section className="a-panel">
          <h2>طلبات التجربة</h2>
          <div className="sa-mini">
            <div><b className="num">{n(since(24))}</b><span>آخر 24 ساعة</span></div>
            <div><b className="num">{n(since(24 * 7))}</b><span>آخر 7 أيام</span></div>
            <div><b className="num">{n(trials.length)}</b><span>من البداية</span></div>
          </div>
          <ul className="sa-feed">
            {trials.slice(0, 5).map((t) => (
              <li key={t.id}>
                <b>{t.name}</b>
                <span className="a-sub">{t.subject ?? ""}{t.notes ? " · 💬 فيه ملاحظات" : ""}</span>
                <small>{fromNow(t.createdAt)}</small>
              </li>
            ))}
          </ul>
          {trials.length === 0 ? <p className="an-empty">لسه مفيش طلبات.</p> : <a className="f-link" href="/admin/trials">كل الطلبات ←</a>}
        </section>

        <section className="a-panel">
          <h2>صفحة التجربة · آخر 7 أيام</h2>
          <div className="sa-mini">
            <div><b className="num">{n(f.views)}</b><span>زيارة</span></div>
            <div><b className="num">{n(f.steps["1"])}</b><span>بدأوا الفورم</span></div>
            <div><b className="num">{n(f.built)}</b><span>موقع اتعمل</span></div>
          </div>
          <p className="a-sub">من الزيارة لموقع: <b>{pct(f.built, f.views)}</b>. من بداية الفورم لموقع: <b>{pct(f.built, f.steps["1"])}</b>.</p>
          <a className="f-link" href="/admin/stats">تفاصيل كل خطوة ←</a>
        </section>
      </div>

      {decide.length > 0 && (
        <section className="a-panel">
          <h2>تجارب محتاجة قرار</h2>
          <p className="a-sub">بتنتهي خلال 6 ساعات أو انتهت من أقل من 3 أيام ولسه متفعّلتش.</p>
          <ul className="sa-feed">
            {decide.map((r) => (
              <li key={r.slug}>
                <a href={`/admin/tenants/${r.slug}`}><b>{r.name}</b></a>
                <span className={`sa-state ${r.state}`}>{STATE_LABEL[r.state]}</span>
                <small>{r.trialEndsAt ? fromNow(r.trialEndsAt) : ""}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="a-panel">
        <h2>مواقع المدرسين · الشهر ده</h2>
        <p className="a-sub">
          <b className="num">{n(visitors)}</b> زائر لكل المدرسين، منهم <b className="num">{n(contacts)}</b> تواصلوا ({pct(contacts, visitors)}).
          {" "}<a className="f-link" href="/admin/stats">الإحصائيات ←</a>
        </p>
      </section>
    </>
  );
}
