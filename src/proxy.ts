import { NextResponse, type NextRequest } from "next/server";
import { env, isDev } from "@/lib/env";
import { isAdminPath, route } from "@/lib/routing";
import { authenticate, authenticatePartner, teacherSlugFor } from "@/lib/server/auth";
import { partnerSlugs } from "@/lib/server/partners";
import { PARTNER_SLUG_RE, RESERVED_PARTNER_SLUGS } from "@/lib/partners";
import { isSiteFileName } from "@/lib/site-files";
import { PREVIEW_PATH, siteEnv, splitSite } from "@/lib/environments";
import { COPY_BOTS, isTrialSite } from "@/lib/server/bots";
import { addressFor } from "@/lib/server/address";

/**
 * Every request is mapped by its host name to /sites/<site>/... (see lib/routing.ts).
 * /admin paths and the private preview (/preview/...) additionally require basic
 * auth; the same check runs again inside every admin page, server action and
 * preview page. On the dev environment (APP_STAGE=dev) every page asks for it.
 */

/** Dev paths that carry their own credentials: the MCP token and signed photo-upload links. */
const OPEN_ON_DEV = /^\/(api\/mcp|api\/upload|upload)(\/|$)/;
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

  const devGate = isDev() && !OPEN_ON_DEV.test(r.rest);

  // A partner's private page (<platform>/<partner>/...): only its own login, or the super admin.
  const first = r.site === "_platform" ? r.rest.split("/")[1] ?? "" : "";
  const partnerPage = PARTNER_SLUG_RE.test(first) && !RESERVED_PARTNER_SLUGS.has(first) && (await partnerSlugs()).has(first);
  if (partnerPage && !(await authenticatePartner(request.headers.get("authorization"), first))) return askLogin();

  if (isAdminPath(r.rest) || preview || (devGate && !partnerPage)) {
    const header = request.headers.get("authorization");
    const principal = await authenticate(header, r.site);
    if (!principal) {
      // A teacher who logs in on the platform console is sent to their own site's admin.
      const teacherSlug = r.site === "_platform" ? await teacherSlugFor(header) : null;
      if (teacherSlug) {
        const home = (await addressFor(teacherSlug)).url;
        const to = home.startsWith("/") ? new URL(`${home}${r.rest}${search}`, request.nextUrl) : `${home}${r.rest}${search}`;
        return NextResponse.redirect(to, 307);
      }
      return askLogin();
    }
  }

  const url = request.nextUrl.clone();
  // Site files (verification files, ads.txt, .well-known/…) are served from the database.
  const file = r.rest.slice(1);
  const rest = isSiteFileName(file) ? `/files/${file}` : r.rest;
  url.pathname = `/sites/${encodeURIComponent(r.site)}${rest === "/" ? "" : rest}`;
  url.search = search;
  const res = NextResponse.rewrite(url);
  if (isAdminPath(r.rest) || preview || partnerPage) res.headers.set("Cache-Control", "no-store");
  if (isAdminPath(r.rest) || preview || partnerPage || isDev()) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function askLogin() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      // One realm per host, so a login entered on one admin page is reused on the next.
      "WWW-Authenticate": `Basic realm="myostaz admin", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|local-assets/|demo/|brand/|segment/).*)"],
};
