import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import { slugForSite } from "@/lib/server/site";
import { activeTenantId, record, toCounters } from "@/lib/server/analytics";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|headless|lighthouse|pingdom|monitor/i;
const MAX_BODY = 8 * 1024;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/**
 * Receives the page's analytics batches (components/Tracker.tsx). Always answers
 * 204 so a failure never shows up on the page. Preview addresses (/t/<slug>) are
 * not counted in production, so checking a site before launch doesn't skew it.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/track">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  if (!hasDb() || site === "_platform") return done();
  if (site.startsWith("p.") && process.env.NODE_ENV === "production") return done();
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
