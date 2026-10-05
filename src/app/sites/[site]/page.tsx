import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteData } from "@/lib/server/site";
import { TenantPage } from "@/components/TenantPage";
import { PlatformHome } from "@/components/PlatformHome";

export async function generateMetadata({ params }: PageProps<"/sites/[site]">): Promise<Metadata> {
  const data = await getSiteData(decodeURIComponent((await params).site));
  if (data.kind !== "tenant") return { title: "portfolioIO", robots: { index: false, follow: false } };
  const { content: c, canonical, indexable } = data;
  const og = c.seo.ogImage;
  return {
    metadataBase: canonical ? new URL(canonical) : undefined,
    alternates: canonical ? { canonical: `${canonical}/` } : undefined,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    title: c.seo.title,
    description: c.seo.description,
    openGraph: {
      title: c.seo.title,
      description: c.seo.description,
      type: "website",
      url: canonical ? `${canonical}/` : undefined,
      locale: c.locale.replace("-", "_"),
      images: og ? [{ url: og, width: 600, height: 315 }] : undefined,
    },
    twitter: { card: "summary_large_image", title: c.seo.title, description: c.seo.description, images: og ? [og] : undefined },
    icons: c.profile.avatar ? { icon: c.profile.avatar } : undefined,
  };
}

export async function generateViewport({ params }: PageProps<"/sites/[site]">): Promise<Viewport> {
  const data = await getSiteData(decodeURIComponent((await params).site));
  return {
    themeColor: data.kind === "tenant" ? data.theme.colors.bg : "#0b0909",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default function Page({ params }: PageProps<"/sites/[site]">) {
  return (
    <Suspense fallback={null}>
      <SiteBody params={params} />
    </Suspense>
  );
}

async function SiteBody({ params }: { params: Promise<{ site: string }> }) {
  const data = await getSiteData(decodeURIComponent((await params).site));
  if (data.kind === "platform") return <PlatformHome />;
  if (data.kind === "missing") notFound();
  return <TenantPage c={data.content} />;
}
