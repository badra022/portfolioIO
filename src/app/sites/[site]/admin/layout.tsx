import type { Metadata } from "next";
import { Suspense } from "react";
import { hasDb } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { principalName, requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children, params }: LayoutProps<"/sites/[site]/admin">) {
  return (
    <div className="admin" lang="ar" dir="rtl">
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
  return (
    <>
      <header className="a-top">
        <a className="a-brand" href={`${base}/admin`}>لوحة التحكم</a>
        <span className="a-site">{slug ? slug : "المنصة"}</span>
        <span className="a-who">{principalName(p)}</span>
        {p.kind === "super" && base && <a className="a-link" href="/admin">كل المدرسين</a>}
      </header>
      {!hasDb() && (
        <div className="a-alert">لا توجد قاعدة بيانات متصلة (DATABASE_URL). الموقع يقرأ من مجلد tenants والحفظ معطّل.</div>
      )}
      <main className="a-main">{children}</main>
    </>
  );
}

function Forbidden() {
  return (
    <main className="a-main">
      <h1>غير مصرح</h1>
      <p>هذا الحساب لا يملك صلاحية على هذه الصفحة. أغلق المتصفح وافتحه مرة أخرى للدخول بحساب آخر.</p>
    </main>
  );
}
