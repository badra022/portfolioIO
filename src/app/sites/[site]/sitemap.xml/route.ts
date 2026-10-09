import { connection } from "next/server";
import { getSiteData } from "@/lib/server/site";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The teacher's pages for search engines: the home page, plus quizzes the teacher
 * chose to show in Google. lastmod is the last save, so Google re-reads after edits.
 */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/sitemap.xml">) {
  await connection();
  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  if (data.kind !== "tenant" || !data.canonical) return new Response("Not found", { status: 404 });
  const lastmod = data.updatedAt ? `<lastmod>${data.updatedAt.slice(0, 10)}</lastmod>` : "";
  const urls = [
    `${data.canonical}/`,
    ...data.content.quizzes.filter((q) => q.indexable).map((q) => `${data.canonical}/${q.path}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc>${lastmod}</url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
