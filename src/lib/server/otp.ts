import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, gte, sql } from "drizzle-orm";
import { env, isDev } from "@/lib/env";
import { db } from "@/lib/db/client";
import { signupOtps, tenants } from "@/lib/db/schema";

/**
 * Phone verification for the «جرّب موقعك» form: a code is sent to the teacher's
 * number (Twilio Verify, by SMS or WhatsApp), and the site is only built once
 * the code is entered. One trial per number.
 *
 * Off for now: set OTP_ENABLED=1 to turn it on. Settings (Vercel env vars):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID  the code sender
 *   OTP_CHANNEL      "sms" (default) or "whatsapp"
 *   OTP_COUNTRIES    calling codes codes may be sent to, e.g. "20,966,971" (default: every
 *                    country the form accepts, lib/phone.ts)
 *   OTP_TEST_CODE    dev environment or local only: a fixed code instead of Twilio
 * While off, the form skips the code; one trial per number still applies.
 */
const twilio = {
  sid: process.env.TWILIO_ACCOUNT_SID ?? "",
  token: process.env.TWILIO_AUTH_TOKEN ?? "",
  service: process.env.TWILIO_VERIFY_SERVICE_SID ?? "",
};
const channel = process.env.OTP_CHANNEL === "whatsapp" ? "whatsapp" : "sms";
const countries = (process.env.OTP_COUNTRIES ?? "").split(",").map((c) => c.trim()).filter(Boolean);
/** Never in production: a fixed code for testing the flow without sending anything. */
const testCode = (isDev() || !process.env.VERCEL) ? process.env.OTP_TEST_CODE ?? "" : "";

const PER_PHONE_HOUR = 3;
const PER_VISITOR_DAY = 8;
const TOKEN_MINUTES = 30;

export const otpEnabled = () => process.env.OTP_ENABLED === "1" && Boolean(testCode || (twilio.sid && twilio.token && twilio.service));
export const otpChannel = () => channel;

/** Is this number from a country the codes may be sent to? (Stops paying for codes to far-away numbers.) */
export const allowedCountry = (digits: string) => countries.length === 0 || countries.some((c) => digits.startsWith(c));

const secret = () => process.env.SIGNUP_SALT || env.mcpToken || env.adminPassword || "portfolioio";
const sign = (payload: string) => createHmac("sha256", secret()).update(`otp|${payload}`).digest("base64url");

/** Proof (for the build request) that this number was verified a moment ago. */
export function phoneToken(digits: string): string {
  const exp = Date.now() + TOKEN_MINUTES * 60_000;
  return `${exp}.${sign(`${digits}.${exp}`)}`;
}

export function checkPhoneToken(digits: string, token: string): boolean {
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const want = Buffer.from(sign(`${digits}.${exp}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Has this number already made a trial site? */
export async function phoneUsed(digits: string): Promise<boolean> {
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.signupPhone, digits)).limit(1)).length > 0;
}

export type OtpResult = { ok: true } | { ok: false; message: string };

export async function sendCode(digits: string, visitor: string): Promise<OtpResult> {
  const hour = new Date(Date.now() - 3600_000), day = new Date(Date.now() - 24 * 3600_000);
  const [counts] = await db().select({
    phone: sql<number>`count(*) filter (where ${signupOtps.phone} = ${digits} and ${signupOtps.createdAt} >= ${hour.toISOString()})::int`,
    visitor: sql<number>`count(*) filter (where ${signupOtps.visitor} = ${visitor})::int`,
  }).from(signupOtps).where(gte(signupOtps.createdAt, day));
  if ((counts?.phone ?? 0) >= PER_PHONE_HOUR) return { ok: false, message: "بعتنا كود كذا مرة للرقم ده. استنى شوية وجرّب تاني." };
  if ((counts?.visitor ?? 0) >= PER_VISITOR_DAY) return { ok: false, message: "طلبت أكواد كتير النهاردة. كلمنا وهنساعدك." };
  await db().insert(signupOtps).values({ phone: digits, visitor });
  if (Math.random() < 0.05) await pruneCodes().catch(() => {});
  if (testCode) return { ok: true };
  const r = await verifyApi("Verifications", { To: `+${digits}`, Channel: channel, Locale: "ar" });
  if (r.ok) return { ok: true };
  console.error("otp send", r.status, r.body.slice(0, 300));
  return { ok: false, message: r.status === 400 ? "الرقم ده مش بيستقبل رسايل. اتأكد منه." : "معرفناش نبعت الكود دلوقتي، جرّب كمان شوية." };
}

export async function checkCode(digits: string, code: string): Promise<boolean> {
  if (!/^\d{4,8}$/.test(code)) return false;
  if (testCode) return code === testCode;
  const r = await verifyApi("VerificationCheck", { To: `+${digits}`, Code: code });
  if (!r.ok) { if (r.status !== 404) console.error("otp check", r.status, r.body.slice(0, 300)); return false; }
  try { return (JSON.parse(r.body) as { status?: string }).status === "approved"; } catch { return false; }
}

async function verifyApi(path: string, form: Record<string, string>) {
  const res = await fetch(`https://verify.twilio.com/v2/Services/${twilio.service}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilio.sid}:${twilio.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

/** Old send records are only needed for a day. */
async function pruneCodes(): Promise<void> {
  await db().delete(signupOtps).where(sql`${signupOtps.createdAt} < now() - interval '2 days'`);
}
