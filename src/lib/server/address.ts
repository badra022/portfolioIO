import "server-only";
import { env } from "@/lib/env";
import { getTenant } from "./repo";

export type Address = { url: string; label: string };
type Domain = { domain: string; isPrimary: boolean };

/**
 * Where students open a teacher's site: the main domain, else <slug>.<ROOT_DOMAIN>.
 * Only without ROOT_DOMAIN (local and the dev environment) is it /t/<slug> on this host.
 * Every link the platform builds to a teacher's site (or its /admin, /preview) starts here.
 */
export function siteAddress(slug: string, domains: Domain[]): Address {
  const primary = domains.find((d) => d.isPrimary)?.domain ?? domains[0]?.domain;
  if (primary) return { url: `https://${primary}`, label: primary };
  if (env.rootDomain) return { url: `https://${slug}.${env.rootDomain}`, label: `${slug}.${env.rootDomain}` };
  return { url: `/t/${slug}`, label: `/t/${slug}` };
}

const cache = new Map<string, { a: Address; until: number }>();

/** siteAddress looked up by slug (remembered for a minute). */
export async function addressFor(slug: string): Promise<Address> {
  const hit = cache.get(slug);
  if (hit && hit.until > Date.now()) return hit.a;
  const t = await getTenant(slug).catch(() => null);
  const a = siteAddress(slug, t?.domains ?? []);
  if (cache.size > 2000) cache.clear();
  cache.set(slug, { a, until: Date.now() + 60_000 });
  return a;
}

/** An address as a full URL: /t/<slug> gets this host's origin. */
export const absolute = (a: Address, origin: string) => (a.url.startsWith("/") ? `${origin}${a.url}` : a.url);
