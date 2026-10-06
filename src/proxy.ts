import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { isAdminPath, route } from "@/lib/routing";
import { authenticate, teacherSlugFor } from "@/lib/server/auth";

/**
 * Every request is mapped by its host name to /sites/<site>/... (see lib/routing.ts).
 * /admin paths additionally require basic auth; the same check runs again inside
 * every admin page and server action.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const r = route(host, pathname, env.rootDomain, env.platformHosts);

  if (isAdminPath(r.rest)) {
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
  url.pathname = `/sites/${encodeURIComponent(r.site)}${r.rest === "/" ? "" : r.rest}`;
  url.search = search;
  const res = NextResponse.rewrite(url);
  if (isAdminPath(r.rest)) {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|local-assets/).*)"],
};
