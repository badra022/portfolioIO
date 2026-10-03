import { Suspense } from "react";
import { getSiteData } from "@/lib/server/site";
import { themeAttrs, themeCss } from "@/lib/theme";
import "../../globals.css";

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
  const { site } = await params;
  const data = await getSiteData(decodeURIComponent(site));
  if (data.kind !== "tenant") return <div className="plain">{children}</div>;
  const { theme, content } = data;
  const fonts = theme.fonts.googleFontsHref;
  return (
    <>
      {fonts && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <style href={`theme-${data.slug}`} precedence="high">{themeCss(theme)}</style>
      <div className="site" lang={content.locale} dir={content.dir} {...themeAttrs(theme)}>
        {children}
      </div>
    </>
  );
}
