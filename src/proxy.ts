import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isAdminPath, route } from "@/lib/routing";
import { authenticate, teacherSlugFor } from "@/lib/server/auth";
import { isSiteFileName } from "@/lib/site-files";
import { PREVIEW_PATH, siteEnv } from "@/lib/environments";

/**
 * Every request is mapped by its host name to /sites/<site>/... (see lib/routing.ts).
 * /admin paths and the private preview (/preview/...) additionally require basic
 * auth; the same check runs again inside every admin page, server action and
 * preview page.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const r = route(host, pathname, env.rootDomain, env.platformHosts);
  const preview = siteEnv(r.site) === "preview";

  // One admin panel for both environments: /preview/admin is /admin.
  if (preview && isAdminPath(r.rest)) {
    const to = request.nextUrl.clone();
    to.pathname = `${r.base.slice(0, -PREVIEW_PATH.length)}${r.rest}`;
    return NextResponse.redirect(to, 307);
  }

  if (isAdminPath(r.rest) || preview) {
    const header = request.headers.get("authorization");
    const principal = await authenticate(header, r.site);
    if (!principal) {
      // A teacher who logs in on the platform console is sent to their own site's admin.
      const teacherSlug = r.site === "_platform" ? await teacherSlugFor(header) : null;
      if (teacherSlug) {
        const to = request.nextUrl.clone();
        to.pathname = `/t/${teacherSlug}${r.rest}`;
        return NextResponse.redirect(to, 307);
      }
      return new NextResponse("Authentication required", {
        status: 401,
        headers: {
          // One realm per host, so a login entered on one admin page is reused on the next.
          "WWW-Authenticate": `Basic realm="portfolioIO admin", charset="UTF-8"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const url = request.nextUrl.clone();
  // Site files (verification files, ads.txt, .well-known/…) are served from the database.
  const file = r.rest.slice(1);
  const rest = isSiteFileName(file) ? `/files/${file}` : r.rest;
  url.pathname = `/sites/${encodeURIComponent(r.site)}${rest === "/" ? "" : rest}`;
  url.search = search;
  const res = NextResponse.rewrite(url);
  if (isAdminPath(r.rest) || preview) {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|local-assets/).*)"],
};
