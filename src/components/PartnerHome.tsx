import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listTenants } from "@/lib/server/repo";
import { overview } from "@/lib/server/analytics";
import { siteAddress } from "@/lib/server/address";
import { partnerForRequest } from "@/lib/server/partners";
import { STATE_LABEL, fromNow, tenantState } from "@/lib/admin/tenant-actions";
import { SignupFlow } from "./signup/SignupFlow";
import { OstazLogo } from "./brand/OstazLogo";
import { DevCredit } from "./DevCredit";
import { CopyText } from "./CopyText";
import "./signup/signup.css";

const n = (v: number) => v.toLocaleString("en-US");

/**
 * A partner's private page on the platform host (<platform>/<slug>, behind its own
 * login, proxy.ts): the sign-up form with the partner's own questions, building
 * as many trial sites as it wants, and every site that belongs to it with its state.
 */
export async function PartnerHome({ slug }: { slug: string }) {
  await connection();
  const h = await headers();
  const partner = await partnerForRequest("_platform", slug, h.get("authorization"), h.get("cookie"));
  if (!partner) notFound();
  const now = Date.now();
  const [tenants, stats] = await Promise.all([listTenants(), overview().catch(() => [])]);
  const visits = new Map(stats.map((s) => [s.slug, s]));
  const sites = tenants.filter((t) => t.partnerId === partner.id)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((t) => ({ ...t, state: tenantState(t, now), address: siteAddress(t.slug, t.domains), visitors: visits.get(t.slug)?.visitors ?? 0, contacts: visits.get(t.slug)?.contacts ?? 0 }));
  const by = (s: string) => sites.filter((x) => x.state === s).length;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const before = env.rootDomain ? "" : `${host}/t/`;
  const after = env.rootDomain ? `.${env.rootDomain}` : "";

  return (
    <main className="su" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <header className="su-head">
        <OstazLogo size={36} href="/" />
        <nav className="su-head-actions">
          <span className="pt-who">{partner.name}</span>
          <a className="su-btn ghost sm" href="#claude">ربط Claude</a>
          <a className="su-btn ghost sm" href="/logout">خروج</a>
        </nav>
      </header>

      <section className="su-hero">
        <div className="su-hero-text">
          <span className="su-badge">صفحة الشريك · خاصة بيك</span>
          <h1>اعمل موقع تجريبي <em>لعميلك</em></h1>
          <p>{partner.form.intro || "املأ بيانات المدرس، والموقع بيتبني في دقيقة بكل أقسامه. ابعت الرابط لعميلك ياخد رأيه. تقدر تعمل مواقع قد ما تحب."}</p>
        </div>
      </section>

      <section className="pt-kpis" aria-label="أرقامك">
        <div><b>{n(sites.length)}</b><span>كل المواقع</span></div>
        <div><b>{n(by("trial"))}</b><span>{STATE_LABEL.trial}</span></div>
        <div><b>{n(by("trialOver"))}</b><span>{STATE_LABEL.trialOver}</span></div>
        <div><b>{n(by("live"))}</b><span>اتفعّلت</span></div>
        <div><b>{n(sites.reduce((a, s) => a + s.visitors, 0))}</b><span>زوار الشهر ده</span></div>
        <div><b>{n(sites.reduce((a, s) => a + s.contacts, 0))}</b><span>تواصلوا</span></div>
      </section>

      <SignupFlow before={before} after={after} otp={false} partner={{ slug: partner.slug, name: partner.name, hours: partner.trialHours, form: partner.form }} />

      <section className="pt-sites" aria-label="مواقعك">
        <h2>مواقعك</h2>
        {sites.length === 0 ? <p className="su-note">لسه معملتش مواقع. أول موقع هيظهر هنا.</p> : (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead><tr><th>المدرس</th><th>الموقع</th><th>الحالة</th><th>زوار الشهر</th><th aria-label="روابط" /></tr></thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.slug}>
                    <td><b>{s.name}</b>{s.createdAt && <small>{fromNow(s.createdAt, now)}</small>}</td>
                    <td><a dir="ltr" href={s.address.url} target="_blank" rel="noopener">{s.address.label}</a></td>
                    <td><span className={`pt-state ${s.state}`}>{STATE_LABEL[s.state]}</span>{s.trialEndsAt && s.state !== "off" && <small>{fromNow(s.trialEndsAt, now)}</small>}</td>
                    <td>{n(s.visitors)}</td>
                    <td><a className="su-btn ghost sm" href={`${s.address.url}/admin`} target="_blank" rel="noopener">لوحة التحكم</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="pt-hint">لوحة تحكم أي موقع من دول بتدخلها بحسابك ده نفسه، أو بحساب المدرس.</p>
      </section>

      <McpGuide url={`${proto}://${host}/api/mcp`} />

      <footer className="su-foot">
        <OstazLogo size={26} href={`/${partner.slug}`} />
        <span>صفحة خاصة بـ {partner.name}</span>
      </footer>
      <DevCredit siteName="myostaz.com" />
    </main>
  );
}

/**
 * How to connect Claude (claude.ai, desktop or phone app) to myostaz with the partner's
 * own login: a custom connector on /api/mcp, which signs in through OAuth
 * (lib/server/oauth.ts). Claude can then read and edit only this partner's sites.
 */
function McpGuide({ url }: { url: string }) {
  return (
    <section className="pt-mcp" id="claude" aria-labelledby="claude-title">
      <h2 id="claude-title">إدارة مواقعك من Claude</h2>
      <p className="pt-hint">اربط Claude بحسابك مرة واحدة، وبعدها اطلب منه بالكلام: يعدّل المواعيد، يضيف عرض، يعمل اختبار، يرد على الطلبات، أو يقولك الأرقام. بيشوف ويعدّل مواقعك إنت بس.</p>
      <ol className="pt-steps">
        <li><b>افتح الإعدادات في Claude</b><span>على claude.ai أو تطبيق الكمبيوتر أو الموبايل: <em>Settings</em> ← <em>Connectors</em> ← <em>Add custom connector</em>. (في حسابات Team أو Enterprise، مسؤول الحساب هو اللي بيضيفه.)</span></li>
        <li><b>حط الاسم والرابط</b><span>الاسم: <code dir="ltr">myostaz</code> · الرابط:</span><CopyText text={url} /></li>
        <li><b>اضغط Connect وسجّل دخولك</b><span>هتفتح صفحة myostaz.com: ادخل بنفس اسم المستخدم وكلمة السر بتوعك، ثم اضغط «اسمح». مش محتاج أي كود أو مفتاح.</span></li>
        <li><b>ابدأ اطلب</b><span>مثلاً: «اعرض مواقعي»، «غيّر ميعاد مجموعة السبت عند مس سارة لـ 5 العصر»، «اعمل اختبار 10 أسئلة على الكيمياء العضوية لموقع حسام»، «مين طلب حجز النهاردة؟».</span></li>
      </ol>
      <p className="pt-hint">لو غيّرت كلمة السر أو عايز تفصل Claude: من نفس صفحة Connectors اضغط Disconnect.</p>
    </section>
  );
}
