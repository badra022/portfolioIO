import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import { getSiteData } from "@/lib/server/site";
import { activeTenantId } from "@/lib/server/analytics";
import { checkAnswers, parseIncoming, saveSubmission } from "@/lib/server/submissions";

const MAX_BODY = 16 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives a form button's submission (components/LeadForms.tsx). Only fields the
 * teacher's form defines are kept; the honeypot ("website") and empty bodies are
 * answered like a success without storing anything, so bots learn nothing.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/f">) {
  await connection();
  const site = decodeURIComponent((await ctx.params).site);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: "too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "bad request" }, 400); }
  if ((body as { website?: unknown })?.website) return json({ ok: true });

  const data = await getSiteData(site);
  if (data.kind !== "tenant") return json({ ok: false, error: "not found" }, 404);
  const incoming = parseIncoming(body);
  const form = incoming && data.content.forms.find((f) => f.id === incoming.form);
  if (!incoming || !form) return json({ ok: false, error: "unknown form" }, 400);

  const checked = checkAnswers(form, incoming.values);
  if (!checked.ok) return json({ ok: false, errors: checked.errors }, 422);
  if (!hasDb()) return json({ ok: false, error: "لا يمكن الإرسال الآن." }, 503);

  try {
    const tenantId = await activeTenantId(data.slug);
    if (!tenantId) return json({ ok: false, error: "not found" }, 404);
    await saveSubmission(tenantId, { formId: form.id, source: incoming.source, place: incoming.place, fields: checked.fields, context: incoming.context, env: data.env });
  } catch (e) {
    console.error("submission", e);
    return json({ ok: false, error: "حصلت مشكلة، حاول تاني." }, 500);
  }
  return json({ ok: true });
}
