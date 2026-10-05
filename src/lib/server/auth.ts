import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { findLogin, touchLogin } from "./repo";
import { safeEqual, verifyPassword } from "./passwords";
import { slugForSite } from "./site";

export type Principal =
  | { kind: "super"; name: string }
  | { kind: "teacher"; id: string; username: string; slug: string };

export const principalName = (p: Principal) => (p.kind === "super" ? `${p.name} (مدير)` : p.username);

function parseBasic(header: string | null): { user: string; pass: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

// A burned-in hash so unknown usernames cost the same time as known ones.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// Successful logins are remembered for a minute per server instance so each admin
// request doesn't pay for a password hash again. Failures are never cached.
const memo = new Map<string, { p: Principal; exp: number }>();
const MEMO_MS = 60_000;

/**
 * Checks basic-auth credentials for a site.
 * - Super admin (ADMIN_USER / ADMIN_PASSWORD): any site, including the platform console.
 * - Teacher (admin_users table): only the site of their own teacher.
 */
export async function authenticate(header: string | null, site: string): Promise<Principal | null> {
  const creds = parseBasic(header);
  if (!creds) return null;
  const key = createHash("sha256").update(`${header}|${site}`).digest("hex");
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.p;

  let p: Principal | null = null;
  if (env.adminUser && env.adminPassword && safeEqual(creds.user, env.adminUser) && safeEqual(creds.pass, env.adminPassword)) {
    p = { kind: "super", name: env.adminUser };
  } else if (site !== "_platform") {
    const [login, slug] = await Promise.all([findLogin(creds.user), slugForSite(site)]);
    const ok = await verifyPassword(creds.pass, login?.hash ?? DUMMY_HASH);
    if (ok && login && !login.disabled && slug && login.slug === slug) {
      p = { kind: "teacher", id: login.id, username: creds.user, slug };
      await touchLogin(login.id).catch(() => {});
    }
  }
  if (p) {
    if (memo.size > 500) memo.clear();
    memo.set(key, { p, exp: Date.now() + MEMO_MS });
  }
  return p;
}

export class ForbiddenError extends Error {
  constructor() { super("غير مصرح"); }
}

/** Use at the top of every admin page and server action. Never rely on proxy.ts alone. */
export async function requireAdmin(site: string): Promise<Principal> {
  const h = await headers();
  const p = await authenticate(h.get("authorization"), site);
  if (!p) throw new ForbiddenError();
  return p;
}

export async function requireSuper(site: string): Promise<Principal & { kind: "super" }> {
  const p = await requireAdmin(site);
  if (p.kind !== "super") throw new ForbiddenError();
  return p;
}
