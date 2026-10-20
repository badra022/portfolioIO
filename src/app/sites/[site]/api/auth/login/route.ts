import { connection } from "next/server";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { signIn } from "@/lib/server/auth";
import { addressFor } from "@/lib/server/address";
import { freshToken, safeNext, sessionCookie, sessionToken } from "@/lib/server/session";

/**
 * The login page's form (app/sites/[site]/login): checks the username and password, sets
 * the session cookie and goes on to `next`, or to the account's own place: the partner's
 * page, the console, the teacher's admin. Two doors: as=admin (super admin and teachers;
 * the only door on a teacher's site) and, on the platform, the partners' login.
 * A password the super admin set goes through the password page first (app/sites/[site]/password).
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/auth/login">) {
  await connection();
  const site = splitSite(decodeURIComponent((await ctx.params).site)).key;
  const base = baseForSite(site);
  const form = await req.formData().catch(() => null);
  const user = String(form?.get("username") ?? "").slice(0, 64);
  const pass = String(form?.get("password") ?? "").slice(0, 200);
  const next = String(form?.get("next") ?? "");
  const door = site !== "_platform" || form?.get("as") === "admin" ? "admin" : "partner";
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const go = (to: string, extra: Record<string, string> = {}) =>
    new Response(null, { status: 303, headers: { Location: new URL(to, origin).toString(), "Cache-Control": "no-store", ...extra } });

  const r = user && pass ? await signIn(user, pass, door) : null;
  if (!r) {
    const q = new URLSearchParams({ e: "1", ...(door === "admin" && site === "_platform" ? { as: "admin" } : {}), ...(next ? { next } : {}) });
    return go(`${base}/login?${q}`);
  }

  let to = safeNext(next, "");
  if (!to) {
    if (r.who.k === "p") to = "/";
    else if (r.who.k === "t" && site === "_platform" && r.teacherSlug) to = `${(await addressFor(r.teacherSlug)).url}/admin`;
    else to = `${base}/admin`;
  }
  const cookie = { "Set-Cookie": sessionCookie(sessionToken(r.who), host, proto === "https") };
  if (r.mustChange) {
    // A teacher's own site is where their password page is when they signed in on the platform.
    const home = r.who.k === "t" && to.startsWith("http") ? new URL(to).origin : "";
    const page = home ? `${home}/password` : `${base}/password`;
    const q = new URLSearchParams({ first: "1", t: freshToken(r.who), next: home ? new URL(to).pathname : to });
    return go(`${page}?${q}`, cookie);
  }
  return go(to, cookie);
}
