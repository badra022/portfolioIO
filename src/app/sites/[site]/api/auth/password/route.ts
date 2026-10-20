import { connection } from "next/server";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { isFresh, readSession, safeNext } from "@/lib/server/session";
import { hashPassword, verifyPassword } from "@/lib/server/passwords";
import { loginHash, setOwnPassword } from "@/lib/server/repo";
import { partnerHash, setPartnerOwnPassword } from "@/lib/server/partners";

/**
 * The password page's form (app/sites/[site]/password): a partner or teacher sets their own
 * password (hashed; the super admin never sees it), or skips it after the first login.
 * The current password is asked for unless they signed in a moment ago.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/auth/password">) {
  await connection();
  const base = baseForSite(splitSite(decodeURIComponent((await ctx.params).site)).key);
  const form = await req.formData().catch(() => null);
  const get = (k: string) => String(form?.get(k) ?? "").slice(0, 200);
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const go = (to: string) => new Response(null, { status: 303, headers: { Location: new URL(to, `${proto}://${host}`).toString(), "Cache-Control": "no-store" } });

  const who = readSession(req.headers.get("cookie"));
  if (!who || who.k === "s") return go(`${base}/password`);
  const next = safeNext(get("next"), who.k === "p" ? "/" : `${base}/admin`);
  const again = (e: string) => go(`${base}/password?${new URLSearchParams({ e, next, t: get("t"), ...(get("first") ? { first: "1" } : {}) })}`);
  const save = (hash?: string) => (who.k === "p" ? setPartnerOwnPassword(who.id, hash) : setOwnPassword(who.id, hash));

  // Skipping after the first login: keep the password, and don't ask again.
  if (get("skip") === "1" && get("first") === "1") {
    await save();
    return go(next);
  }

  const stored = who.k === "p" ? await partnerHash(who.id) : await loginHash(who.id);
  if (!stored) return go(`${base}/login`);
  if (!isFresh(get("t"), who) && !(await verifyPassword(get("current").trim(), stored))) return again("current");
  const password = get("password");
  if (password.trim().length < 8) return again("short");
  if (password !== get("confirm")) return again("match");
  if (await verifyPassword(password.trim(), stored)) return again("same");
  // Logins trim what's typed (lib/server/auth.ts), so the new password is stored trimmed too.
  await save(await hashPassword(password.trim()));
  return go(`${base}/password?${new URLSearchParams({ ok: "1", next })}`);
}
