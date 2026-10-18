import { connection } from "next/server";
import { headers } from "next/headers";
import { hasDb } from "@/lib/env";
import { signupPhone, visitorKey } from "@/lib/server/signup";
import { allowedCountry, checkCode, otpEnabled, phoneToken, phoneUsed, sendCode } from "@/lib/server/otp";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The sign-up form's phone check (lib/server/otp.ts), platform host only:
 *   { action: "send", country, phone }        sends a code (or { skip } when codes are off)
 *   { action: "check", country, phone, code } answers { ok, token } when the code is right
 * Either way a number that already made a trial is refused here first.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/signup/otp">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform" || !hasDb()) return json({ ok: false }, 404);
  const body = (await req.json().catch(() => null)) as { action?: string; country?: string; phone?: string; code?: string } | null;
  const digits = signupPhone({ country: String(body?.country ?? ""), phone: String(body?.phone ?? "") });
  if (!digits) return json({ ok: false, message: "اكتب رقم موبايل واتساب صحيح للبلد اللي اخترتها" }, 422);
  if (await phoneUsed(digits)) return json({ ok: false, message: "الرقم ده عمل موقع تجريبي قبل كده. كلمنا على واتساب ونفعّله ليك." }, 409);
  if (!otpEnabled()) return json({ ok: true, skip: true });
  if (!allowedCountry(digits)) return json({ ok: false, message: "الكود مش متاح لأرقام البلد دي لسه. كلمنا على واتساب." }, 422);

  if (body?.action === "send") {
    const h = await headers();
    const key = visitorKey(h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
    const r = await sendCode(digits, key).catch((e) => { console.error("otp", e); return { ok: false as const, message: "معرفناش نبعت الكود دلوقتي، جرّب كمان شوية." }; });
    return r.ok ? json({ ok: true }) : json(r, 429);
  }
  if (body?.action === "check") {
    const good = await checkCode(digits, String(body.code ?? "").trim()).catch(() => false);
    return good ? json({ ok: true, token: phoneToken(digits) }) : json({ ok: false, message: "الكود مش صح أو انتهى. اتأكد منه أو اطلب كود جديد." }, 422);
  }
  return json({ ok: false }, 400);
}
