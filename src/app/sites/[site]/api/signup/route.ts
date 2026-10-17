import { connection } from "next/server";
import { headers } from "next/headers";
import { hasDb } from "@/lib/env";
import * as repo from "@/lib/server/repo";
import { SLUG_RE } from "@/lib/server/admin-ops";
import { checkFields, createTrial, readFields, tooMany, visitorKey } from "@/lib/server/signup";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const MAX_BODY = 25 * 1024 * 1024;

/** Builds a free trial site from the «جرّب موقعك» form (platform host only). */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/signup">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform") return json({ ok: false }, 404);
  if (!hasDb()) return json({ ok: false, errors: [{ field: "form", message: "الخدمة مش متاحة دلوقتي." }] }, 503);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, errors: [{ field: "photo", message: "الصور كبيرة قوي." }] }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة، حاول تاني." }] }, 400); }
  // Honeypot: answered like a success, nothing is made.
  if (String(form.get("website") ?? "")) return json({ ok: true, base: "", links: [] });

  const h = await headers();
  const key = visitorKey(h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown");
  if (await tooMany(key)) return json({ ok: false, errors: [{ field: "form", message: "عملت مواقع تجريبية كتير النهاردة. كلمنا وهنساعدك." }] }, 429);

  const fields = readFields(form);
  const errors = await checkFields(fields);
  if (errors.length) return json({ ok: false, errors }, 422);
  try {
    const r = await createTrial(fields, { photo: form.get("photo"), logo: form.get("logo") }, key, new URL(req.url).origin);
    return r.ok ? json(r) : json(r, 422);
  } catch (e) {
    console.error("signup", e);
    return json({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة وإحنا بنبني موقعك، حاول تاني." }] }, 500);
  }
}

/** ?slug=... or ?username=...: is it free? (for the form's live check) */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/api/signup">) {
  await connection();
  if (decodeURIComponent((await ctx.params).site) !== "_platform" || !hasDb()) return json({ ok: false }, 404);
  const q = new URL(req.url).searchParams;
  const slug = (q.get("slug") ?? "").toLowerCase();
  if (slug) return json({ ok: true, free: SLUG_RE.test(slug) && slug.length >= 3 && !(await repo.slugTaken(slug)) });
  const username = (q.get("username") ?? "").toLowerCase();
  if (username) return json({ ok: true, free: !(await repo.usernameTaken(username)) });
  return json({ ok: false }, 400);
}
