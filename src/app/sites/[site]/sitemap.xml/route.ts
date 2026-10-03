import { connection } from "next/server";
import { getSiteData } from "@/lib/server/site";

export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/sitemap.xml">) {
  await connection();
  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  if (data.kind !== "tenant" || !data.canonical) return new Response("Not found", { status: 404 });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${data.canonical}/</loc><changefreq>daily</changefreq></url>\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
