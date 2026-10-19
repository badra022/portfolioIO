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
import "./signup/signup.css";

const n = (v: number) => v.toLocaleString("en-US");

/**
 * A partner's private page on the platform host (<platform>/<slug>, behind its own
 * login, proxy.ts): the sign-up form with the partner's own questions, building
 * as many trial sites as it wants, and every site that belongs to it with its state.
 */
export async function PartnerHome({ slug }: { slug: string }) {
  await connection();
  const partner = await partnerForRequest("_platform", slug, (await headers()).get("authorization"));
  if (!partner) notFound();
  const now = Date.now();
  const [tenants, stats] = await Promise.all([listTenants(), overview().catch(() => [])]);
  const visits = new Map(stats.map((s) => [s.slug, s]));
  const sites = tenants.filter((t) => t.partnerId === partner.id)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((t) => ({ ...t, state: tenantState(t, now), address: siteAddress(t.slug, t.domains), visitors: visits.get(t.slug)?.visitors ?? 0, contacts: visits.get(t.slug)?.contacts ?? 0 }));
  const by = (s: string) => sites.filter((x) => x.state === s).length;
  const host = (await headers()).get("host") ?? "";
  const before = env.rootDomain ? "" : `${host}/t/`;
  const after = env.rootDomain ? `.${env.rootDomain}` : "";

  return (
    <main className="su" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <header className="su-head">
        <OstazLogo size={36} href={`/${partner.slug}`} />
        <span className="pt-who">{partner.name}</span>
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

      <footer className="su-foot">
        <OstazLogo size={26} href={`/${partner.slug}`} />
        <span>صفحة خاصة بـ {partner.name}</span>
      </footer>
      <DevCredit siteName="myostaz.com" />
    </main>
  );
}
