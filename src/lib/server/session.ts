import "server-only";
import { env } from "@/lib/env";
import { normalizeHost } from "@/lib/routing";
import { readToken, signToken } from "./tokens";

/**
 * Who is signed in through the login page (/login): the super admin, a partner, or a
 * teacher login. Kept in an HttpOnly cookie; on <ROOT_DOMAIN> it is set for the whole
 * domain, so one login on myostaz.com also opens every <slug>.myostaz.com admin.
 * Basic auth (the browser's own prompt) keeps working next to it (lib/server/auth.ts).
 */
export type Identity = { k: "s" } | { k: "p"; id: string } | { k: "t"; id: string };

export const SESSION_COOKIE = "myostaz_session";
const SESSION_DAYS = 14;
const PURPOSE = "session";

export const sessionToken = (who: Identity) => signToken(PURPOSE, who, SESSION_DAYS * 86400);

export function readSession(cookieHeader: string | null | undefined): Identity | null {
  const raw = (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const t = readToken<{ k: string; id?: string }>(PURPOSE, raw ? decodeURIComponent(raw) : null);
  if (!t) return null;
  if (t.k === "s") return { k: "s" };
  if ((t.k === "p" || t.k === "t") && typeof t.id === "string") return { k: t.k, id: t.id };
  return null;
}

/** The cookie's Domain: the whole <ROOT_DOMAIN> when signing in on it or one of its subdomains, else this host only. */
function domainFor(host: string): string | null {
  const h = normalizeHost(host);
  const root = env.rootDomain;
  return root && (h === root || h.endsWith(`.${root}`)) ? root : null;
}

export function sessionCookie(token: string, host: string, secure: boolean): string {
  const domain = domainFor(host);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}${domain ? `; Domain=${domain}` : ""}`;
}

/** Clears the cookie for this host and, on <ROOT_DOMAIN>, for the whole domain. */
export function clearSessionCookies(host: string, secure: boolean): string[] {
  const base = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  const domain = domainFor(host);
  return domain ? [base, `${base}; Domain=${domain}`] : [base];
}

/** A safe place to go after signing in: a path on this host only (never another site). */
export const safeNext = (next: string | null | undefined, fallback = "/") =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
