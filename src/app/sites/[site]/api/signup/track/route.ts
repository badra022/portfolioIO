import { connection } from "next/server";
import { count } from "@/lib/server/funnel";

const BOT = /bot\b|crawler|spider|slurp|headlesschrome|lighthouse|pagespeed/i;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** The home page's funnel events (lib/server/funnel.ts): { e: ["view", "step:2", ...] }. Platform host only; always 204. */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/signup/track">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform") return done();
  if (BOT.test(req.headers.get("user-agent") ?? "")) return done();
  const text = await req.text();
  if (!text || text.length > 1024) return done();
  try {
    const e = (JSON.parse(text) as { e?: unknown }).e;
    if (Array.isArray(e)) await count(e.filter((x): x is string => typeof x === "string"));
  } catch (err) {
    console.error("funnel", err);
  }
  return done();
}
