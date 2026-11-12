import { connection } from "next/server";
import { env, hasDb } from "@/lib/env";
import { safeEqual } from "@/lib/server/passwords";
import { sweepRevisions } from "@/lib/server/repo";
import { sweepUsage } from "@/lib/server/mcp/usage";

/**
 * Daily clean-up, called by Vercel (vercel.json "crons"): deletes every teacher's saved
 * versions that are past the week (lib/server/repo.ts REVISION_DAYS) and old MCP usage
 * rows. It only removes what is already expired, so a stray call does no harm; with
 * CRON_SECRET set, only Vercel's call (which carries it) is accepted.
 */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/api/cron/sweep">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform") return new Response("Not found", { status: 404 });
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (env.cronSecret && !safeEqual(bearer, env.cronSecret)) return new Response("Unauthorized", { status: 401 });
  if (!hasDb()) return Response.json({ ok: true, skipped: "no database" });
  const [revisions, usage] = await Promise.all([sweepRevisions(), sweepUsage()]);
  return Response.json({ ok: true, deleted: { revisions, usage } }, { headers: { "Cache-Control": "no-store" } });
}
