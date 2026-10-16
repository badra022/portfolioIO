import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { copyFor, getTenant } from "@/lib/server/repo";
import { adminEnv } from "@/lib/server/admin-env";
import { listStudents, studentsCsv, syncStudents } from "@/lib/server/students";
import { cairoDay } from "@/lib/analytics";

/** Every student profile as an Excel-ready CSV. */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/admin/students/export">) {
  const site = decodeURIComponent((await ctx.params).site);
  try { await requireAdmin(site); } catch { return new Response("Unauthorized", { status: 401 }); }
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  if (!slug || !t) return new Response("Not found", { status: 404 });
  if (!t.permissions.students) return new Response("Not in this site's plan.", { status: 403 });
  const env = await adminEnv();
  const content = copyFor(t, env).content;
  await syncStudents(slug, env, content);
  return new Response(studentsCsv(await listStudents(slug, env, content)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="students-${slug}${env === "preview" ? "-preview" : ""}-${cairoDay()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
