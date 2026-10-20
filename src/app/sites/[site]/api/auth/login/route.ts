import { connection } from "next/server";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { signIn } from "@/lib/server/auth";
import { addressFor } from "@/lib/server/address";
import { safeNext, sessionCookie, sessionToken } from "@/lib/server/session";

/**
 * The login page's form (app/sites/[site]/login): checks the username and password
 * (super admin, partner, then teacher), sets the session cookie and goes on to `next`,
 * or to the account's own place: the console, the partner's page, the teacher's admin.
 */
export async function POST(req: Request, ctx: RouteContext<"/sites/[site]/api/auth/login">) {
  await connection();
  const site = splitSite(decodeURIComponent((await ctx.params).site)).key;
  const base = baseForSite(site);
  const form = await req.formData().catch(() => null);
  const user = String(form?.get("username") ?? "").slice(0, 64);
  const pass = String(form?.get("password") ?? "").slice(0, 200);
  const next = String(form?.get("next") ?? "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const back = (path: string, extra: Record<string, string> = {}) => new Response(null, { status: 303, headers: { Location: new URL(path, origin).toString(), "Cache-Control": "no-store", ...extra } });

  const r = user && pass ? await signIn(user, pass) : null;
  if (!r) return back(`${base}/login?e=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);

  let to = safeNext(next, "");
  if (!to) {
    if (r.who.k === "s") to = `${base}/admin`;
    else if (r.who.k === "p") to = site === "_platform" ? "/" : `${base}/admin`;
    else if (site === "_platform" && r.teacherSlug) {
      // A teacher signing in on the platform goes to their own site's admin.
      const home = (await addressFor(r.teacherSlug)).url;
      to = `${home}/admin`;
    } else to = `${base}/admin`;
  }
  const cookie = sessionCookie(sessionToken(r.who), host, proto === "https");
  return to.startsWith("http") ? new Response(null, { status: 303, headers: { Location: to, "Set-Cookie": cookie, "Cache-Control": "no-store" } }) : back(to, { "Set-Cookie": cookie });
}
