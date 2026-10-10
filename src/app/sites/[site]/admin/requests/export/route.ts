import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { listSubmissions, STATUSES, toCsv, type StatusT } from "@/lib/server/submissions";
import { cairoDay } from "@/lib/analytics";

/** The requests list (same filters as the page) as a CSV that opens in Excel with Arabic intact. */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/admin/requests/export">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  try { await requireAdmin(site); } catch { return new Response("Unauthorized", { status: 401 }); }
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const status = (STATUSES as readonly string[]).includes(q.get("status") ?? "") ? (q.get("status") as StatusT) : undefined;
  const env = await adminEnv();
  const { rows } = await listSubmissions(slug, { env, form: q.get("form") || undefined, status, q: q.get("q")?.slice(0, 60) || undefined, limit: 20_000 });
  return new Response(toCsv(rows, copyFor(t, env).content.forms), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="requests-${slug}${env === "preview" ? "-preview" : ""}-${cairoDay()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
