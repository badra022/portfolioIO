import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import { getSiteData } from "@/lib/server/site";
import { activeTenantId } from "@/lib/server/analytics";
import { cleanComplaint, saveComplaint } from "@/lib/server/complaints";
import { ui } from "@/lib/i18n";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives an anonymous complaint (components/Complaints.tsx). Only the message and
 * its topic are read; no cookie is set and nothing about the sender (address,
 * device, referral) is looked at or stored. The honeypot ("website") is answered
 * like a success without storing anything.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/c">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  const text = await req.text();
  if (text.length > 12 * 1024) return json({ ok: false, error: "too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "bad request" }, 400); }
  if ((body as { website?: unknown })?.website) return json({ ok: true });

  const data = await getSiteData(site);
  if (data.kind !== "tenant") return json({ ok: false, error: "not found" }, 404);
  const t = ui(data.content.locale);
  // The box only takes messages while the section is on.
  if (!data.content.sections.includes("complaints")) return json({ ok: false, error: "not found" }, 404);
  const c = cleanComplaint(body, data.content.complaints?.categories ?? []);
  if (!c) return json({ ok: false, error: t.complaintsShort }, 422);
  if (!hasDb()) return json({ ok: false, error: t.cantSend }, 503);

  try {
    const tenantId = await activeTenantId(data.slug);
    if (!tenantId) return json({ ok: false, error: "not found" }, 404);
    if ((await saveComplaint(tenantId, data.env, c)) === "full") return json({ ok: false, error: t.tooMany }, 429);
  } catch (e) {
    console.error("complaint", e);
    return json({ ok: false, error: t.error }, 500);
  }
  return json({ ok: true });
}
