import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { sessionAccount } from "@/lib/server/auth";
import { isFresh, readSession, safeNext } from "@/lib/server/session";
import { OstazLogo } from "@/components/brand/OstazLogo";
import "@/components/signup/signup.css";

export const metadata: Metadata = { title: "كلمة السر", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  short: "كلمة السر لازم تكون 8 حروف أو أكتر.",
  match: "الكلمتين مش زي بعض.",
  current: "كلمة السر الحالية مش صح.",
  same: "اختار كلمة سر غير اللي اتبعتتلك.",
};

/**
 * Picking one's own password (partners and teachers): right after the first login with
 * the password the super admin set (?first=1, which can be skipped), or any time from the
 * «كلمة السر» links. The super admin's password lives in the server settings instead.
 */
export default function Password(props: PageProps<"/sites/[site]/password">) {
  return <Suspense fallback={null}><PasswordBody {...props} /></Suspense>;
}

async function PasswordBody({ params, searchParams }: PageProps<"/sites/[site]/password">) {
  await connection();
  const site = splitSite(decodeURIComponent((await params).site)).key;
  const base = baseForSite(site);
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const cookie = (await headers()).get("cookie");
  const who = readSession(cookie);
  const acct = await sessionAccount(cookie).catch(() => null);
  const self = `${base}/password`;
  if (!who || !acct) redirect(`${base}/login${site === "_platform" ? "?as=admin&" : "?"}next=${encodeURIComponent(self)}`);
  const first = one(q.first) === "1";
  const fresh = isFresh(one(q.t), who);
  const home = acct.kind === "partner" ? "/" : `${base}/admin`;
  const next = safeNext(one(q.next), home);
  const error = ERRORS[one(q.e)];
  const done = one(q.ok) === "1";

  return (
    <main className="su su-login-page" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      {acct.kind === "super" ? (
        <div className="su-card su-login">
          <OstazLogo size={34} />
          <h1>كلمة سر المدير</h1>
          <p className="su-muted">كلمة سر إدارة المنصة متسجلة في إعدادات السيرفر (ADMIN_PASSWORD على Vercel)، وبتتغير من هناك.</p>
          <a className="su-btn primary" href={next}>رجوع</a>
        </div>
      ) : done ? (
        <div className="su-card su-login">
          <OstazLogo size={34} />
          <h1>كلمة السر اتغيرت</h1>
          <p className="su-muted">من دلوقتي ادخل بكلمة السر الجديدة. محدش غيرك يعرفها، ولا حتى إدارة myostaz.</p>
          <a className="su-btn primary" href={next}>كمّل</a>
        </div>
      ) : (
        <form className="su-card su-login" method="post" action={`${base}/api/auth/password`}>
          <OstazLogo size={34} />
          <h1>{first ? "اختار كلمة سر خاصة بيك" : "تغيير كلمة السر"}</h1>
          <p className="su-muted">
            {first ? "كلمة السر اللي دخلت بيها اتعملت من إدارة myostaz. اختار واحدة جديدة محدش يعرفها غيرك. " : ""}
            اسم المستخدم <b dir="ltr">{acct.kind === "partner" ? acct.partner.username : acct.username}</b> مش بيتغير.
          </p>
          {error && <p className="su-err su-form-err" role="alert">{error}</p>}
          {!fresh && (
            <label className="su-field"><span>كلمة السر الحالية</span>
              <input name="current" type="password" required dir="ltr" autoComplete="current-password" />
            </label>
          )}
          <label className="su-field"><span>كلمة السر الجديدة</span>
            <input name="password" type="password" required minLength={8} dir="ltr" autoComplete="new-password" autoFocus={fresh} />
          </label>
          <label className="su-field"><span>أكّد كلمة السر الجديدة</span>
            <input name="confirm" type="password" required minLength={8} dir="ltr" autoComplete="new-password" />
          </label>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="t" value={one(q.t)} />
          {first && <input type="hidden" name="first" value="1" />}
          <button type="submit" className="su-btn primary">حفظ كلمة السر</button>
          {first
            ? <button type="submit" name="skip" value="1" formNoValidate className="su-btn ghost">تخطّي وكمّل بكلمة السر الحالية</button>
            : <a className="su-btn ghost" href={next}>رجوع</a>}
        </form>
      )}
    </main>
  );
}
