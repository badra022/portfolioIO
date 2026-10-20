import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { sessionAccount } from "@/lib/server/auth";
import { OstazLogo } from "@/components/brand/OstazLogo";
import "@/components/signup/signup.css";

export const metadata: Metadata = { title: "تسجيل الدخول", robots: { index: false, follow: false } };

/**
 * One login page for everyone (instead of the browser's basic-auth prompt): the super
 * admin, partners and teachers. On myostaz.com it also opens every <slug>.myostaz.com
 * admin (lib/server/session.ts). ?next= is where to go after signing in.
 */
export default function Login(props: PageProps<"/sites/[site]/login">) {
  return <Suspense fallback={null}><LoginBody {...props} /></Suspense>;
}

async function LoginBody({ params, searchParams }: PageProps<"/sites/[site]/login">) {
  await connection();
  const site = splitSite(decodeURIComponent((await params).site)).key;
  const base = baseForSite(site);
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const next = one(q.next);
  const failed = one(q.e) === "1";
  const acct = await sessionAccount((await headers()).get("cookie")).catch(() => null);
  const platform = site === "_platform";

  return (
    <main className="su su-login-page" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <form className="su-card su-login" method="post" action={`${base}/api/auth/login`}>
        <OstazLogo size={34} href={platform ? "/" : undefined} />
        <h1>تسجيل الدخول</h1>
        <p className="su-muted">{platform ? "للشركاء وإدارة المنصة. المدرس بيدخل من هنا كمان ويروح للوحة تحكم موقعه." : "لوحة تحكم الموقع."}</p>
        {acct && (
          <p className="su-note">أنت مسجل دخول بالفعل. <a href={next || (platform ? (acct.kind === "super" ? "/admin" : "/") : `${base}/admin`)}>كمّل</a> أو <a href={`${base}/logout`}>اخرج</a> وادخل بحساب تاني.</p>
        )}
        {failed && <p className="su-err su-form-err" role="alert">اسم المستخدم أو كلمة السر مش صح.</p>}
        <label className="su-field"><span>اسم المستخدم</span>
          <input name="username" required dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        </label>
        <label className="su-field"><span>كلمة السر</span>
          <input name="password" type="password" required dir="ltr" autoComplete="current-password" />
        </label>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="su-btn primary">دخول</button>
        {platform && <p className="su-muted su-login-foot">الحسابات بتتعمل من إدارة المنصة بس. عايز تبقى شريك؟ كلمنا على واتساب.</p>}
      </form>
    </main>
  );
}
