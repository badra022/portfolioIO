import { Suspense } from "react";
import { getSiteData } from "@/lib/server/site";
import { requireAdmin } from "@/lib/server/auth";
import { PREVIEW_PATH } from "@/lib/environments";
import { themeAttrs, themeCss } from "@/lib/theme";
import "../../globals.css";
import "../../sections.css";

/** The platform host is known at build time; every teacher site is rendered on first visit, then cached. */
export function generateStaticParams() {
  return [{ site: "_platform" }];
}

/**
 * Root layout for every host. The teacher (and their theme) is only known once
 * the site param is read, so that happens inside <Suspense>: the first visit to a
 * site streams in, later visits are served as a fully cached page.
 */
export default function RootLayout({ children, params }: LayoutProps<"/sites/[site]">) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <Suspense fallback={null}>
          <SiteFrame params={params}>{children}</SiteFrame>
        </Suspense>
      </body>
    </html>
  );
}

async function SiteFrame({ params, children }: { params: Promise<{ site: string }>; children: React.ReactNode }) {
  const site = decodeURIComponent((await params).site);
  const data = await getSiteData(site);
  if (data.kind !== "tenant") return <div className="plain">{children}</div>;
  // proxy.ts already asks for the admin login on /preview; checked again here, never relying on the proxy alone.
  if (data.env === "preview" && !(await requireAdmin(site).then(() => true, () => false))) return <div className="plain"><p>غير مصرح.</p></div>;
  const { theme, content } = data;
  const fonts = theme.fonts.googleFontsHref;
  return (
    <>
      {fonts && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <style href={`theme-${data.slug}-${data.env}`} precedence="high">{themeCss(theme)}</style>
      <div className="site" lang={content.locale} dir={content.dir} {...themeAttrs(theme)}>
        {data.env === "preview" && <PreviewBar base={data.base} />}
        {children}
      </div>
    </>
  );
}

/** Shown on every preview page, so nobody mistakes it for the live site. */
function PreviewBar({ base }: { base: string }) {
  const site = base.slice(0, -PREVIEW_PATH.length);
  return (
    <div className="preview-bar" role="note" dir="rtl">
      <b>معاينة خاصة</b>
      <span>الزوار مش شايفين النسخة دي. اللي بيتبعت منها (طلبات، اختبارات، إحصائيات) بيتسجل في المعاينة بس.</span>
      <a href={`${site}/admin`}>لوحة التحكم</a>
      <a href={`${site}/`}>الموقع الحقيقي</a>
    </div>
  );
}
