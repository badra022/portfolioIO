import { connection } from "next/server";
import { count } from "@/lib/server/funnel";
import { partnerForRequest } from "@/lib/server/partners";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** A partner page's funnel events (lib/server/funnel.ts), counted under the partner's slug. Always 204. */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/[quiz]/track">) {
  await connection();
  const { site, quiz } = await ctx.params;
  const partner = await partnerForRequest(decodeURIComponent(site), decodeURIComponent(quiz), req.headers.get("authorization"));
  if (!partner) return done();
  const text = await req.text();
  if (!text || text.length > 1024) return done();
  try {
    const e = (JSON.parse(text) as { e?: unknown }).e;
    if (Array.isArray(e)) await count(e.filter((x): x is string => typeof x === "string"), new Date(), partner.slug);
  } catch (err) {
    console.error("partner funnel", err);
  }
  return done();
}
