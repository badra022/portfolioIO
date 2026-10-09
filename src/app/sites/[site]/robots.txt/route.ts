import { connection } from "next/server";
import { getSiteData } from "@/lib/server/site";

/**
 * Admin, API and upload pages are never crawled. Everything else may be fetched,
 * so Google's tools (Rich Results Test, URL inspection) can read preview pages and
 * secondary domains too; those pages carry `noindex`, which keeps them out of
 * search (a robots.txt block would hide that tag from Google). Only the teacher's
 * main address lists a sitemap and is indexed.
 */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/robots.txt">) {
  await connection();
  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  const sitemap = data.kind === "tenant" && data.indexable ? `\nSitemap: ${data.canonical}/sitemap.xml\n` : "";
  const body = "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /upload\nDisallow: /t/*/admin\nDisallow: /t/*/api/\nDisallow: /t/*/upload\n" + sitemap;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
