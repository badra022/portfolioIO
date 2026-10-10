import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { env } from "@/lib/env";
import { baseForSite } from "@/lib/routing";
import { withLiveContent } from "@/lib/content-utils";
import type { Content, Theme } from "@/lib/schema";
import { splitSite, type SiteEnv } from "@/lib/environments";
import { copyFor, findSlugByDomain, getTenant } from "./repo";
import { resolveImages } from "./assets";
import { publishedExams, type PastExam } from "./exam-results";

export const tenantTag = (slug: string) => `tenant:${slug}`;
export const DOMAINS_TAG = "domains";

export type SiteData =
  | { kind: "platform" }
  | { kind: "missing" }
  | {
      kind: "tenant";
      slug: string;
      /** production, or the private preview at <address>/preview (lib/environments.ts). */
      env: SiteEnv;
      content: Content;
      theme: Theme;
      /** Absolute URL of the teacher's main address, used for canonical links and sitemaps. */
      canonical: string | null;
      /** False on preview addresses (vercel.app, /t/<slug>, secondary domains) so Google indexes one address only. */
      indexable: boolean;
      /** Prefix for links inside the site ("" or "/t/<slug>"). */
      base: string;
      /** Last save (ISO), for sitemaps. */
      updatedAt: string | null;
      /** Changes with every save; added to generated URLs (share image) so caches refresh. */
      version: number;
      /** Past exams whose results students can look up (published in /admin/results). */
      pastExams: PastExam[];
    };

/** Resolves a site key (from routing.ts) to the slug it serves, or null. */
export async function slugForSite(siteKey: string): Promise<string | null> {
  const site = splitSite(siteKey).key;
  if (site.startsWith("d.")) {
    // www.example.com and example.com serve the same teacher even if only one was added.
    const domain = site.slice(2);
    const twin = domain.startsWith("www.") ? domain.slice(4) : `www.${domain}`;
    return (await findSlugByDomain(domain)) ?? (await findSlugByDomain(twin));
  }
  if (site.startsWith("s.") || site.startsWith("p.")) return site.slice(2);
  return null;
}

/**
 * Everything a public page needs, cached per site. Saving in the admin calls
 * updateTag(tenantTag(slug)), so visitors see the change on their next request.
 * The page also refreshes at least hourly so finished exams disappear.
 */
export async function getSiteData(siteKey: string): Promise<SiteData> {
  "use cache";
  cacheLife("hours");
  if (siteKey === "_platform") return { kind: "platform" };
  const { key: site, env: siteEnv } = splitSite(siteKey);
  if (site.startsWith("d.")) cacheTag(DOMAINS_TAG);
  const slug = await slugForSite(site);
  if (!slug) return { kind: "missing" };
  // Saving either copy (production or preview) refreshes both through this tag.
  cacheTag(tenantTag(slug));
  const t = await getTenant(slug);
  if (!t || t.status !== "active") return { kind: "missing" };

  const primary = t.domains.find((d) => d.isPrimary)?.domain ?? null;
  const canonicalHost = primary ?? (env.rootDomain ? `${slug}.${env.rootDomain}` : null);
  const servedHost = site.startsWith("d.") ? site.slice(2) : site.startsWith("s.") ? `${slug}.${env.rootDomain}` : null;
  const copy = copyFor(t, siteEnv);
  return {
    kind: "tenant",
    slug,
    env: siteEnv,
    content: resolveImages(withLiveContent(copy.content, new Date()), slug),
    theme: copy.theme,
    canonical: canonicalHost ? `https://${canonicalHost}` : null,
    // The preview is never indexed (it's also behind the admin login).
    indexable: siteEnv === "production" && Boolean(canonicalHost && servedHost === canonicalHost),
    base: baseForSite(siteKey),
    updatedAt: t.updatedAt,
    version: siteEnv === "preview" ? t.version * 10_000 + t.preview.version : t.version,
    // Publishing results refreshes this through the same tag (tenantTag).
    pastExams: t.id ? await publishedExams(t.id, siteEnv).catch((e) => { console.error("past exams", e); return []; }) : [],
  };
}
