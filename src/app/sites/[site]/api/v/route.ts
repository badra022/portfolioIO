import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import { slugForSite } from "@/lib/server/site";
import { activeTenantId, record, toCounters } from "@/lib/server/analytics";

// Link-preview fetchers never run the page's JavaScript, so only scripted browsers need catching here.
// Keep this narrow: in-app browsers (Facebook, Instagram, TikTok...) carry their app's name in the user agent.
const BOT = /bot\b|crawler|spider|slurp|headlesschrome|lighthouse|pagespeed/i;
const MAX_BODY = 8 * 1024;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Receives the page's analytics batches (components/Tracker.tsx). Always answers
 * 204 so a failure never shows up on the page. Every address of a teacher counts,
 * including /t/<slug> (a teacher without a domain yet is only reachable there);
 * the people checking the site are left out by the tracker instead (IgnoreThisBrowser).
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/v">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  if (!hasDb() || site === "_platform") return done();
  if (BOT.test(req.headers.get("user-agent") ?? "")) return done();

  const text = await req.text();
  if (!text || text.length > MAX_BODY) return done();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return done(); }

  try {
    const slug = await slugForSite(site);
    const tenantId = slug ? await activeTenantId(slug) : null;
    if (tenantId) await record(tenantId, toCounters(body));
  } catch (e) {
    console.error("analytics", e);
  }
  return done();
}
