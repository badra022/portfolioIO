import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { authenticate, sessionAccount } from "@/lib/server/auth";
import { addressFor } from "@/lib/server/address";
import { safeNext } from "@/lib/server/session";
import { OstazLogo } from "@/components/brand/OstazLogo";
import "@/components/signup/signup.css";
import { DEVELOPER } from "@/lib/platform";

export const metadata: Metadata = { title: "تسجيل الدخول", robots: { index: false, follow: false } };

/**
 * The login page, instead of the browser's basic-auth prompt. Two doors:
 * - on myostaz.com, the partners' login (the «دخول الشركاء» button on the home page);
 * - ?as=admin, and every teacher's site: the admin login (super admin and teachers), where
 *   every /admin sends a visitor who isn't signed in.
 * On myostaz.com one login also opens every <slug>.myostaz.com (lib/server/session.ts).
 * Already signed in: straight on to where the login would have taken them.
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
  const next = safeNext(one(q.next), "");
  const failed = one(q.e) === "1";
  const platform = site === "_platform";
  const admin = !platform || one(q.as) === "admin";
  const cookie = (await headers()).get("cookie");

  const acct = await sessionAccount(cookie).catch(() => null);
  if (acct) {
    if (!admin && acct.kind === "partner") redirect(next.startsWith("/oauth/") ? next : "/");
    if (!admin && acct.kind === "super") redirect(next || "/");
    if (admin && (await authenticate(site, cookie).catch(() => null))) redirect(next || `${base}/admin`);
    if (admin && platform && acct.kind === "teacher") redirect(next.startsWith("/oauth/") ? next : `${(await addressFor(acct.slug)).url}/admin`);
  }

  return (
    <main className="su su-login-page" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <form className="su-card su-login" method="post" action={`${base}/api/auth/login`}>
        <OstazLogo size={34} href={platform ? "/" : undefined} />
        {admin ? (
          <>
            <h1>دخول لوحة التحكم</h1>
            <p className="su-muted">{platform ? "لإدارة المنصة والمدرسين. الشركاء بيدخلوا من «دخول الشركاء»." : "لوحة تحكم الموقع: ادخل بحسابك اللي اتبعتلك."}</p>
          </>
        ) : (
          <>
            <span className="su-badge">للشركاء فقط</span>
            <h1>دخول الشركاء</h1>
            <p className="su-muted">ادخل باسم المستخدم وكلمة السر اللي إدارة myostaz عملتهولك. أول مرة هتختار كلمة سر جديدة خاصة بيك.</p>
          </>
        )}
        {failed && <p className="su-err su-form-err" role="alert">اسم المستخدم أو كلمة السر مش صح.</p>}
        <label className="su-field"><span>اسم المستخدم</span>
          <input name="username" required dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
        </label>
        <label className="su-field"><span>كلمة السر</span>
          <input name="password" type="password" required dir="ltr" autoComplete="current-password" />
        </label>
        <input type="hidden" name="next" value={next} />
        {admin && platform && <input type="hidden" name="as" value="admin" />}
        <button type="submit" className="su-btn primary">{admin ? "دخول" : "دخول كشريك"}</button>
        {platform && !admin && <p className="su-muted su-login-foot">حسابات الشركاء بتتعمل من إدارة myostaz بس. عايز تبقى شريك؟ <a href={`https://wa.me/${DEVELOPER.whatsapp}`} target="_blank" rel="noopener">كلمنا على واتساب</a>.</p>}
        {platform && <p className="su-muted su-login-foot"><a href="/">الرجوع للصفحة الرئيسية</a></p>}
        {platform && !admin && next.startsWith("/oauth/") && <p className="su-muted su-login-foot">بتربط Claude كمدرس أو كمدير؟ <a href={`/login?as=admin&next=${encodeURIComponent(next)}`}>ادخل من هنا</a></p>}
      </form>
    </main>
  );
}
