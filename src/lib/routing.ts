import { PREVIEW_PATH, splitSite, withEnv } from "./environments";
/**
 * Maps an incoming (host, path) to an internal route under /sites/<site>/...
 * Pure function: used by proxy.ts and by server code that needs the same answer.
 *
 * Site keys:
 *   _platform     the platform console (your own domain, *.vercel.app, localhost)
 *   p.<slug>      a teacher previewed on a platform host at /t/<slug>  (links need the /t/<slug> prefix)
 *   s.<slug>      a teacher on <slug>.<ROOT_DOMAIN>
 *   d.<domain>    a teacher on their own custom domain
 *
 * Any teacher key may end in "~preview": the private preview of that site at
 * <address>/preview/... (lib/environments.ts), e.g. "d.teacher.com~preview".
 */

export type Route = { site: string; rest: string; base: string };

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isPlatformHost(host: string, rootDomain: string, platformHosts: string[]): boolean {
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (host.endsWith(".vercel.app")) return true;
  if (platformHosts.includes(host)) return true;
  if (rootDomain && (host === rootDomain || host === `www.${rootDomain}`)) return true;
  return false;
}

export function route(hostRaw: string | null | undefined, pathname: string, rootDomain: string, platformHosts: string[]): Route {
  const r = siteRoute(hostRaw, pathname, rootDomain, platformHosts);
  if (r.site !== "_platform" && (r.rest === PREVIEW_PATH || r.rest.startsWith(`${PREVIEW_PATH}/`))) {
    return { site: withEnv(r.site, "preview"), rest: r.rest.slice(PREVIEW_PATH.length) || "/", base: `${r.base}${PREVIEW_PATH}` };
  }
  return r;
}

function siteRoute(hostRaw: string | null | undefined, pathname: string, rootDomain: string, platformHosts: string[]): Route {
  const host = normalizeHost(hostRaw);
  if (isPlatformHost(host, rootDomain, platformHosts)) {
    const m = pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
    if (m && SLUG.test(m[1])) return { site: `p.${m[1]}`, rest: m[2] || "/", base: `/t/${m[1]}` };
    return { site: "_platform", rest: pathname || "/", base: "" };
  }
  if (rootDomain && host.endsWith(`.${rootDomain}`)) {
    const sub = host.slice(0, -(rootDomain.length + 1));
    if (SLUG.test(sub)) return { site: `s.${sub}`, rest: pathname || "/", base: "" };
  }
  return { site: `d.${host}`, rest: pathname || "/", base: "" };
}

export const isAdminPath = (rest: string) => rest === "/admin" || rest.startsWith("/admin/");

/** The public base path for links inside a site: "" on a teacher's address, "/t/<slug>" on a platform host, plus "/preview" in preview. */
export function baseForSite(site: string): string {
  const { key, env } = splitSite(site);
  return `${key.startsWith("p.") ? `/t/${key.slice(2)}` : ""}${env === "preview" ? PREVIEW_PATH : ""}`;
}
