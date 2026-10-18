import "server-only";
import { eq } from "drizzle-orm";
import { hasDb } from "@/lib/env";
import { db } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";
import { slugForSite } from "./site";

/**
 * Free trial sites turn away AI assistants, AI crawlers and copying tools
 * (proxy.ts), so a trial can't simply be handed to an AI or a scraper to rebuild.
 * Link previews (WhatsApp, Facebook) still work. A deterrent: anything a person
 * can see can still be photographed, which is what the trial bars and marked sample images are for.
 */
export const COPY_BOTS = new RegExp([
  // AI assistants fetching a page for a user, and AI crawlers
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "Claude-Web", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "GoogleOther", "Gemini", "Bard", "CCBot", "Bytespider", "TikTokSpider",
  "Amazonbot", "Applebot-Extended", "meta-externalagent", "meta-externalfetcher", "cohere", "Diffbot", "YouBot", "DuckAssistBot",
  "MistralAI", "ImagesiftBot", "Omgili", "Timpibot", "PetalBot", "AI2Bot", "Kangaroo", "Firecrawl", "Jina", "Manus", "Devin",
  // copying tools and scripts
  "HTTrack", "SiteSucker", "WebCopier", "WebZIP", "Offline Explorer", "Teleport", "wget", "curl", "python-requests", "python-urllib",
  "aiohttp", "httpx", "Scrapy", "Go-http-client", "node-fetch", "axios", "undici", "okhttp", "Java/", "libwww", "HeadlessChrome",
  "PhantomJS", "Puppeteer", "Playwright", "Selenium", "wkhtmlto",
].map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|"), "i");

const cache = new Map<string, { trial: boolean; until: number }>();

/** Is this site (a routing key) a free trial? Cached for a minute. */
export async function isTrialSite(site: string): Promise<boolean> {
  if (site === "_platform" || !hasDb()) return false;
  const hit = cache.get(site);
  if (hit && hit.until > Date.now()) return hit.trial;
  const slug = await slugForSite(site).catch(() => null);
  const row = slug ? (await db().select({ t: tenants.trialEndsAt }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0] : undefined;
  const trial = Boolean(row?.t);
  if (cache.size > 2000) cache.clear();
  cache.set(site, { trial, until: Date.now() + 60_000 });
  return trial;
}
