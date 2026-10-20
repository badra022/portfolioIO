import { connection } from "next/server";
import { hasDb } from "@/lib/env";
import * as repo from "@/lib/server/repo";
import { count } from "@/lib/server/funnel";
import { SLUG_MESSAGES, checkFields, createTrial, readFields, slugStatus } from "@/lib/server/signup";
import { partnerForRequest, partnerTrialsSince } from "@/lib/server/partners";
import { checkExtra } from "@/lib/partners";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const MAX_BODY = 25 * 1024 * 1024;
/** A safety cap against a leaked login or a stuck script, far above real use. */
const PER_HOUR = 60;

type Ctx = RouteContext<"/sites/[site]/[quiz]/build">;
const partnerOf = async (req: Request, ctx: Ctx) => {
  const { site, quiz } = await ctx.params;
  return partnerForRequest(decodeURIComponent(site), decodeURIComponent(quiz), req.headers.get("authorization"), req.headers.get("cookie"));
};

/** Builds a trial site from a partner's page (<platform>/<partner>): no per-device, per-number or per-network limit. */
export async function POST(req: Request, ctx: Ctx) {
  await connection();
  if (!hasDb()) return json({ ok: false, errors: [{ field: "form", message: "الخدمة مش متاحة دلوقتي." }] }, 503);
  const partner = await partnerOf(req, ctx);
  if (!partner) return json({ ok: false, errors: [{ field: "form", message: "سجّل دخول حسابك تاني." }] }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false, errors: [{ field: "photo", message: "الصور كبيرة قوي." }] }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة، حاول تاني." }] }, 400); }
  if (await partnerTrialsSince(partner.id, 1) >= PER_HOUR) return json({ ok: false, errors: [{ field: "form", message: "عملت مواقع كتير في الساعة دي. استنى شوية أو كلمنا." }] }, 429);

  const fields = readFields(form);
  const errors = await checkFields(fields, true);
  const answers = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("x:")).map(([k, v]) => [k.slice(2), String(v)]));
  const extra = checkExtra(partner.form, answers);
  if (!extra.ok) errors.push({ field: extra.field as "form", message: extra.message });
  if (errors.length) {
    await count(["rejected:form"], new Date(), partner.slug).catch(() => {});
    return json({ ok: false, errors }, 422);
  }
  try {
    const origin = new URL(req.url).origin;
    const r = await createTrial(fields, { photo: form.get("photo"), logo: form.get("logo") }, "", origin, { partner, extra: extra.ok ? extra.extra : {} });
    if (!r.ok) return json(r, 422);
    await count(["built"], new Date(), partner.slug).catch(() => {});
    return json(r);
  } catch (e) {
    console.error("partner signup", e);
    if (String((e as { code?: string })?.code) === "23505") return json({ ok: false, errors: [{ field: "form", message: "العنوان أو اسم المستخدم لسه متاخد دلوقتي. راجعهم وجرّب تاني." }] }, 422);
    return json({ ok: false, errors: [{ field: "form", message: "حصلت مشكلة وإحنا بنبني الموقع، حاول تاني." }] }, 500);
  }
}

/** The form's live checks: ?slug=... { free, message }, ?username=... { free }. */
export async function GET(req: Request, ctx: Ctx) {
  await connection();
  if (!hasDb() || !(await partnerOf(req, ctx))) return json({ ok: false }, 404);
  const q = new URL(req.url).searchParams;
  const slug = (q.get("slug") ?? "").toLowerCase();
  if (slug) {
    const status = await slugStatus(slug);
    return json({ ok: true, free: status === "free", message: status === "free" ? "" : SLUG_MESSAGES[status] });
  }
  const username = (q.get("username") ?? "").toLowerCase();
  if (username) return json({ ok: true, free: !(await repo.usernameTaken(username)) });
  return json({ ok: false }, 400);
}
