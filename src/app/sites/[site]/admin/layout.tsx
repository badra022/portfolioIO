import type { Metadata } from "next";
import { Suspense } from "react";
import { env as appEnv, hasDb } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { principalName, requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { IgnoreThisBrowser } from "@/components/Tracker";
import { EnvSwitch } from "@/components/admin/EnvSwitch";
import { adminEnv } from "@/lib/server/admin-env";
import { PREVIEW_PATH } from "@/lib/environments";
import { getTenant } from "@/lib/server/repo";
import { formatWhen } from "@/lib/admin/format";
import { adminCounts } from "@/lib/server/admin-counts";
import { AdminNav, Breadcrumb } from "@/components/admin/AdminNav";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children, params }: LayoutProps<"/sites/[site]/admin">) {
  return (
    <div className="admin" lang="ar" dir="rtl">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" precedence="default" />
      <Suspense fallback={<p className="a-loading">جاري التحميل…</p>}>
        <Gate params={params}>{children}</Gate>
      </Suspense>
    </div>
  );
}

async function Gate({ params, children }: { params: Promise<{ site: string }>; children: React.ReactNode }) {
  const site = decodeURIComponent((await params).site);
  const p = await requireAdmin(site).catch(() => null);
  if (!p) return <Forbidden />;
  const slug = site === "_platform" ? null : await slugForSite(site);
  const base = baseForSite(site);
  const env = slug ? await adminEnv() : "production";
  const envNote = env === "preview" && (
    <p className="a-envnote">
      انت شايف بيانات <b>المعاينة</b>: الطلبات والاختبارات والإحصائيات اللي جت من رابط المعاينة بس. لبيانات الطلاب الحقيقية اختار &quot;الموقع&quot; من فوق.
    </p>
  );
  const noDb = !hasDb() && (
    <div className="a-alert">لا توجد قاعدة بيانات متصلة (DATABASE_URL). الموقع يقرأ من مجلد tenants والحفظ معطّل.</div>
  );
  const t = slug ? await getTenant(slug) : null;

  if (slug && t) {
    const counts = await adminCounts(t, env).catch(() => ({ requests: 0, grading: 0, complaints: 0 }));
    return (
      <div className="an-shell">
        <IgnoreThisBrowser />
        <AdminNav
          base={base}
          name={t.content.profile.name || t.name}
          siteLabel={siteLabel(site, slug)}
          siteUrl={`${base}/`}
          isSuper={p.kind === "super"}
          counts={{ requests: counts.requests, grading: counts.grading, complaints: counts.complaints }}
        />
        <div className="an-body">
          <header className="an-top">
            <Breadcrumb base={base} />
            <span className="an-top-end">
              <EnvSwitch env={env} previewUrl={`${base}${PREVIEW_PATH}/`} />
              <a className="btn-sm ghost an-view" href={`${base}/`} target="_blank" rel="noopener">شوف موقعك ↗</a>
              {p.kind === "super" && <a className="an-super" href="/admin">كل المدرسين</a>}
            </span>
          </header>
          {noDb}
          <main className="a-main">
            {t.trialEndsAt && (
              <p className="a-envnote a-trial-note">
                ده موقع تجريبي مجاني، شغال لحد <b>{formatWhen(t.trialEndsAt)}</b>. جرّب كل حاجة براحتك، ولو عجبك كلمنا نفعّله ليك ويفضل كل اللي عملته.
              </p>
            )}
            {envNote}
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      <IgnoreThisBrowser />
      <header className="a-top">
        <a className="a-brand" href={`${base}/admin`}>لوحة التحكم</a>
        <span className="a-site">{slug ? slug : "المنصة"}</span>
        {slug && <EnvSwitch env={env} previewUrl={`${base}${PREVIEW_PATH}/`} />}
        <span className="a-who">{principalName(p)}</span>
        {p.kind === "super" && base && <a className="a-link" href="/admin">كل المدرسين</a>}
      </header>
      {noDb}
      <main className="a-main">
        {envNote}
        {children}
      </main>
    </>
  );
}

/** The teacher's address as students see it, under their name in the menu. */
function siteLabel(site: string, slug: string): string {
  const key = site.replace(/~preview$/, "");
  if (key.startsWith("d.")) return key.slice(2);
  if (key.startsWith("s.") && appEnv.rootDomain) return `${slug}.${appEnv.rootDomain}`;
  return `/t/${slug}`;
}

function Forbidden() {
  return (
    <main className="a-main">
      <h1>غير مصرح</h1>
      <p>هذا الحساب لا يملك صلاحية على هذه الصفحة. أغلق المتصفح وافتحه مرة أخرى للدخول بحساب آخر.</p>
    </main>
  );
}
