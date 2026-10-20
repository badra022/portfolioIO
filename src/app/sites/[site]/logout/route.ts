import { connection } from "next/server";
import { baseForSite } from "@/lib/routing";
import { splitSite } from "@/lib/environments";
import { clearSessionCookies } from "@/lib/server/session";

/** Signs out (the session cookie, for this host and the whole <ROOT_DOMAIN>): back to myostaz.com's home page, or a teacher site's login. */
export async function GET(req: Request, ctx: RouteContext<"/sites/[site]/logout">) {
  await connection();
  const site = splitSite(decodeURIComponent((await ctx.params).site)).key;
  const base = baseForSite(site);
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const headers = new Headers({ Location: new URL(site === "_platform" ? "/" : `${base}/login`, `${proto}://${host}`).toString(), "Cache-Control": "no-store" });
  for (const c of clearSessionCookies(host, proto === "https")) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}
