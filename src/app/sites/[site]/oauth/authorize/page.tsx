import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { checkAuthorize } from "@/lib/server/oauth";
import { sessionAccount } from "@/lib/server/auth";
import { addressFor } from "@/lib/server/address";
import { OstazLogo } from "@/components/brand/OstazLogo";
import "@/components/signup/signup.css";

export const metadata: Metadata = { title: "ربط Claude بحسابك", robots: { index: false, follow: false } };

/**
 * OAuth authorize (lib/server/oauth.ts): Claude (or another AI app) sends the partner or the
 * teacher here when they add the myostaz connector. Not signed in → the login page first
 * (the «connect» door: a partner's login or a site's admin login); then «اسمح» gives the app
 * access to this account's sites only (a teacher: their own site).
 */
export default function Authorize(props: PageProps<"/sites/[site]/oauth/authorize">) {
  return <Suspense fallback={null}><AuthorizeBody {...props} /></Suspense>;
}

async function AuthorizeBody({ params, searchParams }: PageProps<"/sites/[site]/oauth/authorize">) {
  await connection();
  if (decodeURIComponent((await params).site) !== "_platform") notFound();
  const raw = await searchParams;
  const q = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])) as [string, string][]);
  const checked = await checkAuthorize(q);
  const acct = await sessionAccount((await headers()).get("cookie")).catch(() => null);
  if (checked.ok && !acct) redirect(`/login?as=connect&next=${encodeURIComponent(`/oauth/authorize?${q}`)}`);
  const reach = acct?.kind === "teacher"
    ? <>موقعك <b dir="ltr">{(await addressFor(acct.slug)).label}</b></>
    : <>مواقع <b>{acct?.kind === "partner" ? acct.partner.name : "إدارة المنصة (كل المواقع)"}</b></>;

  return (
    <main className="su su-login-page" lang="ar" dir="rtl">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <div className="su-card su-login">
        <OstazLogo size={34} />
        {!checked.ok ? (
          <>
            <h1>الطلب ده مش صالح</h1>
            <p className="su-err" dir="ltr">{checked.error}</p>
          </>
        ) : (
          <form method="post" action="/oauth/approve" className="su-login">
            <h1>ربط {checked.req.clientName || "Claude"} بحسابك</h1>
            <p className="su-note">هيقدر يقرا ويعدّل {reach}: المحتوى والمواعيد والعروض والاختبارات، ويشوف الطلبات والإحصائيات. مش هيشوف أي موقع تاني.</p>
            {[...q.entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <button type="submit" name="decision" value="allow" className="su-btn primary">اسمح</button>
            <button type="submit" name="decision" value="deny" className="su-btn ghost">لأ</button>
            <p className="su-muted su-login-foot">مش إنت؟ <a href="/logout">اخرج</a> وادخل بحسابك.</p>
          </form>
        )}
      </div>
    </main>
  );
}
