import { connection } from "next/server";
import { getSiteData } from "@/lib/server/site";

/** Index only the teacher's main address; previews and secondary domains are kept out of search. */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/robots.txt">) {
  await connection();
  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  const body = data.kind === "tenant" && data.indexable
    ? `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${data.canonical}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
