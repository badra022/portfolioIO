import { connection } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { slugForSite } from "@/lib/server/site";
import { getTenant } from "@/lib/server/repo";
import { attemptsCsv, listAttempts } from "@/lib/server/quiz-attempts";
import { cairoDay } from "@/lib/analytics";

/** A quiz's attempts as a CSV for Excel: details, status, score, time, every answer with ✓/✗. */
export async function GET(_req: Request, ctx: RouteContext<"/sites/[site]/admin/quizzes/[path]/export">) {
  await connection();
  const { site: raw, path } = await ctx.params;
  const site = decodeURIComponent(raw);
  try { await requireAdmin(site); } catch { return new Response("Unauthorized", { status: 401 }); }
  const slug = await slugForSite(site);
  const t = slug ? await getTenant(slug) : null;
  const quiz = t?.content.quizzes.find((q) => q.path === decodeURIComponent(path));
  if (!slug || !t || !quiz) return new Response("Not found", { status: 404 });
  const form = quiz.form ? t.content.forms.find((f) => f.id === quiz.form) : undefined;
  return new Response(attemptsCsv(quiz, form, await listAttempts(slug, quiz)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quiz-${quiz.path}-${cairoDay()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
