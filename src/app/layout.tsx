import type { Metadata, Viewport } from "next";
import { getTenant } from "@/lib/tenant";
import { asset } from "@/lib/assets";
import { themeAttrs, themeCss } from "@/lib/theme";
import "./globals.css";

export function generateMetadata(): Metadata {
  const { content } = getTenant();
  const site = process.env.SITE_URL;
  const og = content.seo.ogImage ? asset(content.seo.ogImage) : undefined;
  return {
    metadataBase: site ? new URL(new URL(site).origin) : undefined,
    alternates: site ? { canonical: site } : undefined,
    title: content.seo.title,
    description: content.seo.description,
    openGraph: {
      title: content.seo.title,
      description: content.seo.description,
      type: "website",
      locale: content.locale.replace("-", "_"),
      images: og ? [{ url: og, width: 600, height: 315 }] : undefined,
    },
    twitter: { card: "summary_large_image", title: content.seo.title, description: content.seo.description, images: og ? [og] : undefined },
    icons: content.profile.avatar ? { icon: asset(content.profile.avatar) } : undefined,
  };
}

export function generateViewport(): Viewport {
  const { theme } = getTenant();
  return { themeColor: theme.colors.bg, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { content, theme } = getTenant();
  const href = theme.fonts.googleFontsHref;
  return (
    <html lang={content.locale} dir={content.dir} {...themeAttrs(theme)}>
      <head>
        {href && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={href} />
          </>
        )}
        <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
