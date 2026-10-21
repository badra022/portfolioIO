import { NextResponse, type NextRequest } from "next/server";
import { env, isDev } from "@/lib/env";
import { isAdminPath, route } from "@/lib/routing";
import { authenticate, authenticatePartner, isDevGateOpen, sessionAccount, teacherSlugFor } from "@/lib/server/auth";
import { partnerSlugs } from "@/lib/server/partners";
import { PARTNER_SLUG_RE, RESERVED_PARTNER_SLUGS } from "@/lib/partners";
import { isSiteFileName } from "@/lib/site-files";
import { PREVIEW_PATH, siteEnv, splitSite } from "@/lib/environments";
import { COPY_BOTS, isTrialSite } from "@/lib/server/bots";
import { addressFor } from "@/lib/server/address";

/**
 * Every request is mapped by its host name to /sites/<site>/... (see lib/routing.ts).
 * /admin paths and the private preview (/preview/...) additionally require a login on the
 * login page (its session cookie, lib/server/session.ts); a partner's page needs that
 * partner signed in. The same check runs again inside every admin page, server action
 * and preview page. On the dev environment (APP_STAGE=dev) every page is also behind
 * the browser's basic-auth prompt with the dev super admin's login (its only use).
 */

/**
 * Dev paths that carry their own credentials or are called by Claude's servers, which
 * can't answer the prompt: the MCP server (its token or OAuth), signed photo-upload links,
 * and OAuth discovery, registration and tokens. The OAuth sign-in page itself is a page.
 */
const OPEN_ON_DEV = /^\/(api\/mcp|api\/upload|upload|oauth\/register|oauth\/token|\.well-known\/oauth-[a-z-]+)(\/|$|-)/;
/** The platform's OAuth discovery documents (lib/server/oauth.ts), never a teacher's site file. */
const OAUTH_WELL_KNOWN = /^\/\.well-known\/oauth-(protected-resource|authorization-server)(\/|$)/;
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const r = route(host, pathname, env.rootDomain, env.platformHosts);
  const preview = siteEnv(r.site) === "preview";

  // With ROOT_DOMAIN set, /t/<slug>/... is an old link: the site lives at <slug>.<ROOT_DOMAIN> (or its own domain).
  if (env.rootDomain && r.site.startsWith("p.")) {
    const home = (await addressFor(splitSite(r.site).key.slice(2))).url;
    if (!home.startsWith("/")) return NextResponse.redirect(`${home}${preview ? PREVIEW_PATH : ""}${r.rest}${search}`, 308);
  }

  // One admin panel for both environments: /preview/admin is /admin.
  if (preview && isAdminPath(r.rest)) {
    const to = request.nextUrl.clone();
    to.pathname = `${r.base.slice(0, -PREVIEW_PATH.length)}${r.rest}`;
    return NextResponse.redirect(to, 307);
  }

  // Free trial sites turn away AI assistants, crawlers and copying tools (lib/server/bots.ts).
  if (r.site !== "_platform" && COPY_BOTS.test(request.headers.get("user-agent") ?? "") && !isAdminPath(r.rest) && await isTrialSite(splitSite(r.site).key)) {
    return new NextResponse("This is a private trial site.", { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
  }

  if (isDev() && !OPEN_ON_DEV.test(r.rest) && !isDevGateOpen(request.headers.get("authorization"))) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": `Basic realm="myostaz dev", charset="UTF-8"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  // myostaz.com itself is for partners: visitors who aren't signed in as a partner (or the super admin) get the partners' login.
  if (r.site === "_platform" && r.rest === "/" && request.method === "GET") {
    const acct = await sessionAccount(request.headers.get("cookie")).catch(() => null);
    if (acct?.kind !== "partner" && acct?.kind !== "super") {
      const to = request.nextUrl.clone();
      to.pathname = `${r.base}/login`;
      to.search = "";
      return NextResponse.redirect(to, 307);
    }
  }

  // A partner's private page (<platform>/<partner>/...): only that partner signed in, or the super admin.
  const first = r.site === "_platform" ? r.rest.split("/")[1] ?? "" : "";
  const partnerPage = PARTNER_SLUG_RE.test(first) && !RESERVED_PARTNER_SLUGS.has(first) && (await partnerSlugs()).has(first);
  const cookie = request.headers.get("cookie");
  if (partnerPage && !(await authenticatePartner(first, cookie))) return askLogin(request, r.base, "partner");

  if (isAdminPath(r.rest) || preview) {
    const principal = await authenticate(r.site, cookie);
    if (!principal) {
      // A teacher signed in on the platform console is sent to their own site's admin.
      const teacherSlug = r.site === "_platform" ? await teacherSlugFor(cookie) : null;
      if (teacherSlug) {
        const home = (await addressFor(teacherSlug)).url;
        const to = home.startsWith("/") ? new URL(`${home}${r.rest}${search}`, request.nextUrl) : `${home}${r.rest}${search}`;
        return NextResponse.redirect(to, 307);
      }
      return askLogin(request, r.base, "admin");
    }
  }

  const url = request.nextUrl.clone();
  // Site files (verification files, ads.txt, .well-known/…) are served from the database.
  const file = r.rest.slice(1);
  const rest = isSiteFileName(file) && !(r.site === "_platform" && OAUTH_WELL_KNOWN.test(r.rest)) ? `/files/${file}` : r.rest;
  url.pathname = `/sites/${encodeURIComponent(r.site)}${rest === "/" ? "" : rest}`;
  url.search = search;
  const res = NextResponse.rewrite(url);
  if (isAdminPath(r.rest) || preview || partnerPage) res.headers.set("Cache-Control", "no-store");
  if (isAdminPath(r.rest) || preview || partnerPage || isDev()) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

/**
 * Not signed in: a browser opening a page goes to the login page (and comes back after):
 * the admin login for /admin and previews, the partners' login for a partner's page.
 * Anything else (fetches, scripts) gets a plain 401.
 */
function askLogin(request: NextRequest, base: string, door: "admin" | "partner") {
  const html = request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
  if (html) {
    const root = base.endsWith(PREVIEW_PATH) ? base.slice(0, -PREVIEW_PATH.length) : base;
    const to = request.nextUrl.clone();
    to.pathname = `${root}/login`;
    to.search = `?${door === "admin" ? "as=admin&" : ""}next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(to, 303);
  }
  return new NextResponse("Sign in first", { status: 401, headers: { "Cache-Control": "no-store" } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|local-assets/|demo/|brand/|segment/).*)"],
};
