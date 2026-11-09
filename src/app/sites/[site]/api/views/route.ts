import { connection } from "next/server";
import { getSiteData } from "@/lib/server/site";
import { takerTotals, viewTotals } from "@/lib/server/library";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Fresh counts for a list page of the content library (components/LibraryList.tsx,
 * ExamsList.tsx), read on every load while the page itself stays cached:
 * ?kind=articles|games → views per item; ?kind=exams → students who took each quiz.
 * Only items the teacher shows counts for are answered.
 */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/api/views">) {
  await connection();
  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  if (data.kind !== "tenant" || !data.permissions.library) return json({ counts: {} }, 404);
  const c = data.content;
  if (!c.library.showViews) return json({ counts: {} });
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind === "exams") {
    const takers = await takerTotals(data.slug, data.env).catch(() => ({} as Record<string, number>));
    const shown = new Set(c.quizzes.filter((q) => q.listed && q.showViews).map((q) => q.path));
    return json({ counts: Object.fromEntries(Object.entries(takers).filter(([p]) => shown.has(p))) });
  }
  const keys = kind === "articles" ? c.articles.filter((a) => a.showViews).map((a) => `a:${a.path}`)
    : kind === "games" ? c.games.filter((g) => g.showViews).map((g) => `g:${g.path}`)
    : kind === "article" ? c.articles.filter((a) => a.showViews && a.path === new URL(req.url).searchParams.get("path")).map((a) => `a:${a.path}`)
    : kind === "game" ? c.games.filter((g) => g.showViews && g.path === new URL(req.url).searchParams.get("path")).map((g) => `g:${g.path}`)
    : [];
  return json({ counts: await viewTotals(data.slug, data.env, keys).catch(() => ({})) });
}
