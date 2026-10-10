import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import { getSiteData } from "@/lib/server/site";
import { activeTenantId } from "@/lib/server/analytics";
import { lookupResult } from "@/lib/server/exam-results";
import { firstNameKey, isPhoneKey, phoneKey } from "@/lib/exam-results";

const MAX_BODY = 2 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Lookups per visitor (IP) per 10 minutes, per server instance: enough for a family, too few to guess phone numbers. */
const LIMIT = 20;
const WINDOW = 10 * 60_000;
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > WINDOW) hits.delete(k);
  return recent.length > LIMIT;
}

/**
 * A student's result in a past exam (components/ExamResults.tsx): the exam id,
 * their name and phone. Both the phone (without country code) and the first name
 * must match the teacher's sheet; a miss says nothing about which one was wrong.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/r">) {
  await connection();
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: "too large" }, 413);
  let body: { exam?: unknown; name?: unknown; phone?: unknown; website?: unknown };
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: "bad request" }, 400); }
  if (body.website) return json({ ok: true, found: false });

  const name = typeof body.name === "string" ? body.name.slice(0, 120) : "";
  const phone = typeof body.phone === "string" ? body.phone.slice(0, 30) : "";
  const errors: Record<string, string> = {};
  if (!firstNameKey(name)) errors.name = "اكتب اسمك";
  if (!isPhoneKey(phoneKey(phone))) errors.phone = "اكتب رقم صحيح";
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "?";
  if (limited(ip)) return json({ ok: false, error: "محاولات كتير. استنى شوية وجرّب تاني." }, 429);

  const data = await getSiteData(decodeURIComponent((await ctx.params).site));
  const id = Number(body.exam);
  if (data.kind !== "tenant" || !Number.isInteger(id) || !hasDb()) return json({ ok: false, error: "not found" }, 404);
  try {
    const tenantId = await activeTenantId(data.slug);
    if (!tenantId) return json({ ok: false, error: "not found" }, 404);
    const r = await lookupResult(tenantId, id, name, phone);
    if (r === "missing") return json({ ok: false, error: "النتيجة دي مش متاحة دلوقتي." }, 404);
    return json(r ? { ok: true, found: true, result: r } : { ok: true, found: false });
  } catch (e) {
    console.error("result lookup", e);
    return json({ ok: false, error: "حصلت مشكلة، حاول تاني." }, 500);
  }
}
