import { connection } from "next/server";
import { headers } from "next/headers";
import { hasDb } from "@/lib/env";
import * as repo from "@/lib/server/repo";
import { SLUG_MESSAGES, checkFields, createTrial, deviceCookie, deviceTrial, readFields, siteBase, slugStatus, tooMany, visitorKey } from "@/lib/server/signup";

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
const MAX_BODY = 25 * 1024 * 1024;

/** Builds a free trial site from the «جرّب موقعك» form (platform host only). One per browser, number and a few per network. */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/signup">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform") return json({ ok: false }, 404);
  if (!hasDb()) return json({ ok: false, errors: [{ field: "form", message: "الخدمة مش متاحة دلوقتي." }] }, 503);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, errors: [{ field: "photo", message: "الصور كبيرة قوي." }] }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة، حاول تاني." }] }, 400); }
  // Honeypot: answered like a success, nothing is made.
  if (String(form.get("website") ?? "")) return json({ ok: true, base: "", links: [] });

  const origin = new URL(req.url).origin;
  const mine = await deviceTrial(req.headers.get("cookie"));
  if (mine) {
    return json({ ok: false, built: { base: siteBase(mine.slug, origin), endsAt: mine.endsAt }, errors: [{ field: "form", message: "عملت موقع تجريبي من الجهاز ده قبل كده." }] }, 409);
  }

  const h = await headers();
  const key = visitorKey(h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
  const limit = await tooMany(key);
  if (limit) return json({ ok: false, errors: [{ field: "form", message: limit }] }, 429);

  const fields = readFields(form);
  const errors = await checkFields(fields);
  if (errors.length) return json({ ok: false, errors }, 422);
  try {
    const r = await createTrial(fields, { photo: form.get("photo"), logo: form.get("logo") }, key, origin);
    if (!r.ok) return json(r, 422);
    return json(r, 200, { "Set-Cookie": deviceCookie(fields.slug, origin.startsWith("https:")) });
  } catch (e) {
    console.error("signup", e);
    // Two sign-ups racing for the same address, username or number.
    if (String((e as { code?: string })?.code) === "23505") return json({ ok: false, errors: [{ field: "form", message: "العنوان أو اسم المستخدم أو الرقم لسه متاخد دلوقتي. راجعهم وجرّب تاني." }] }, 422);
    return json({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة وإحنا بنبني موقعك، حاول تاني." }] }, 500);
  }
}

/**
 * The form's live checks:
 *   ?slug=...      { free, message } for the site address
 *   ?username=...  { free }
 *   ?me=1          { built } the trial this browser already made, if any
 */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/api/signup">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform" || !hasDb()) return json({ ok: false }, 404);
  const q = new URL(req.url).searchParams;
  if (q.get("me")) {
    const mine = await deviceTrial(req.headers.get("cookie"));
    return json({ ok: true, built: mine ? { base: siteBase(mine.slug, new URL(req.url).origin), endsAt: mine.endsAt } : null });
  }
  const slug = (q.get("slug") ?? "").toLowerCase();
  if (slug) {
    const status = await slugStatus(slug);
    return json({ ok: true, free: status === "free", message: status === "free" ? "" : SLUG_MESSAGES[status] });
  }
  const username = (q.get("username") ?? "").toLowerCase();
  if (username) return json({ ok: true, free: !(await repo.usernameTaken(username)) });
  return json({ ok: false }, 400);
}
