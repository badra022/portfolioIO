import { connection } from "next/server";
import { headers } from "next/headers";
import { hasDb } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { visitorKey } from "@/lib/server/signup";
import { CONTACT_ROLES, addContact, type ContactRole } from "@/lib/server/contact";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The «كلمنا» form on the platform's home page (components/landing/ContactForm.tsx). Platform host only. */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/contact">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform") return json({ ok: false }, 404);
  if (!hasDb()) return json({ ok: false, message: "الخدمة مش متاحة دلوقتي، كلمنا على واتساب." }, 503);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const get = (k: string, max: number) => String(body?.[k] ?? "").trim().slice(0, max);
  // Honeypot: answered like a success, nothing is saved.
  if (get("website", 200)) return json({ ok: true });
  const name = get("name", 80), message = get("message", 1500), subject = get("subject", 120);
  const role = (get("role", 20) in CONTACT_ROLES ? get("role", 20) : "other") as ContactRole;
  const phone = normalizePhone(get("country", 4) || "20", get("phone", 30));
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "اكتب اسمك";
  if (!phone) errors.phone = "رقم واتساب مش صحيح";
  if (Object.keys(errors).length) return json({ ok: false, errors }, 400);
  const h = await headers();
  const visitor = visitorKey(h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
  const r = await addContact({ name, phone: phone!, role, subject, message, visitor });
  if (r === "limit") return json({ ok: false, message: "وصلتنا رسايلك، هنكلمك قريب. لو مستعجل كلمنا على واتساب." }, 429);
  return json({ ok: true });
}
