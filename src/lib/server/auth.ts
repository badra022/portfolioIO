import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { findLogin, findLoginById, touchLogin } from "./repo";
import { safeEqual, verifyPassword } from "./passwords";
import { slugForSite } from "./site";
import { checkPartner, getPartnerById, partnerIdOf, type Partner } from "./partners";
import { readSession, type Identity } from "./session";

export type Principal =
  | { kind: "super"; name: string }
  | { kind: "teacher"; id: string; username: string; slug: string }
  /** A partner (agency) managing one of its own teachers' sites (lib/server/partners.ts). */
  | { kind: "partner"; id: string; username: string; name: string; slug: string };

export const principalName = (p: Principal) => (p.kind === "super" ? `${p.name} (مدير)` : p.kind === "partner" ? `${p.name} (شريك)` : p.username);

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

// Who a session is on a site is remembered for a minute per server instance.
const memo = new Map<string, { p: Principal; exp: number }>();
const MEMO_MS = 60_000;

const isSuperCreds = (c: { user: string; pass: string }) =>
  Boolean(env.adminUser && env.adminPassword && safeEqual(c.user.trim(), env.adminUser) && safeEqual(c.pass, env.adminPassword));

/**
 * The dev environment's own gate (proxy.ts): the browser's basic-auth prompt with the
 * dev super admin's login, in front of every page. Nothing else uses basic auth.
 */
export const isDevGateOpen = (header: string | null) => {
  const c = parseBasic(header);
  return Boolean(c && isSuperCreds(c));
};

/**
 * Who a request is, for a site, from the login page's session cookie (lib/server/session.ts).
 * - Super admin: any site, including the platform console.
 * - Teacher (admin_users): only the site of their own teacher.
 * - Partner (partners): the sites of the teachers that belong to it, even after their trial ended.
 */
export async function authenticate(site: string, cookie: string | null): Promise<Principal | null> {
  const who = readSession(cookie);
  if (!who) return null;
  const key = `${JSON.stringify(who)}|${site}`;
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.p;
  const p = await fromSession(who, site);
  if (p) {
    if (memo.size > 500) memo.clear();
    memo.set(key, { p, exp: Date.now() + MEMO_MS });
  }
  return p;
}

async function fromSession(who: Identity, site: string): Promise<Principal | null> {
  if (who.k === "s") return env.adminUser ? { kind: "super", name: env.adminUser } : null;
  if (site === "_platform") return null;
  const slug = await slugForSite(site);
  if (!slug) return null;
  if (who.k === "t") {
    const login = await findLoginById(who.id);
    return login && !login.disabled && login.slug === slug ? { kind: "teacher", id: login.id, username: login.username, slug } : null;
  }
  const partner = await getPartnerById(who.id);
  return partner && !partner.disabled && (await partnerIdOf(slug)) === partner.id
    ? { kind: "partner", id: partner.id, username: partner.username, name: partner.name, slug } : null;
}

/**
 * Verifies teacher credentials regardless of site. Usernames are stored lowercase,
 * and phones capitalize the first letter of the login box, so the username is
 * matched case-insensitively. Copy-pasted credentials often carry stray spaces;
 * generated passwords never contain spaces, so trimming is safe.
 */
async function checkTeacher(creds: { user: string; pass: string }): Promise<{ id: string; username: string; slug: string; mustChange: boolean } | null> {
  const username = creds.user.trim().toLowerCase();
  const login = username ? await findLogin(username) : null;
  const ok = await verifyPassword(creds.pass.trim(), login?.hash ?? DUMMY_HASH);
  return ok && login && !login.disabled ? { id: login.id, username, slug: login.slug, mustChange: login.mustChange } : null;
}

/**
 * The login page: who these credentials are, or null. Two doors: the partners' login
 * on myostaz.com, and the admin login (super admin and teachers) in front of every /admin.
 * mustChange: the password is still the one the super admin set (app/sites/[site]/password).
 */
export async function signIn(user: string, pass: string, door: "partner" | "admin"): Promise<{ who: Identity; teacherSlug?: string; mustChange: boolean } | null> {
  const creds = { user, pass };
  if (door === "partner") {
    const partner = await checkPartner(creds);
    return partner ? { who: { k: "p", id: partner.id }, mustChange: partner.mustChange } : null;
  }
  if (isSuperCreds(creds)) return { who: { k: "s" }, mustChange: false };
  const login = await checkTeacher(creds);
  if (login) {
    await touchLogin(login.id).catch(() => {});
    return { who: { k: "t", id: login.id }, teacherSlug: login.slug, mustChange: login.mustChange };
  }
  return null;
}

export type Account = { kind: "super" } | { kind: "partner"; partner: Partner } | { kind: "teacher"; id: string; username: string; slug: string };

/** The signed-in account behind a session cookie (still allowed), or null. */
export async function sessionAccount(cookie: string | null): Promise<Account | null> {
  const who = readSession(cookie);
  if (!who) return null;
  if (who.k === "s") return env.adminUser ? { kind: "super" } : null;
  if (who.k === "p") {
    const partner = await getPartnerById(who.id);
    return partner && !partner.disabled ? { kind: "partner", partner } : null;
  }
  const login = await findLoginById(who.id);
  return login && !login.disabled ? { kind: "teacher", id: login.id, username: login.username, slug: login.slug } : null;
}

/** For the platform host: the teacher signed in, if any (their console is their own site's admin). */
export async function teacherSlugFor(cookie: string | null): Promise<string | null> {
  const acct = await sessionAccount(cookie);
  return acct?.kind === "teacher" ? acct.slug : null;
}

/** For a partner's page on the platform host (<platform>/<slug>): that partner signed in, or the super admin. */
export async function authenticatePartner(partnerSlug: string, cookie: string | null): Promise<{ partner: Partner | null; isSuper: boolean } | null> {
  const acct = await sessionAccount(cookie);
  if (acct?.kind === "super") return { partner: null, isSuper: true };
  if (acct?.kind === "partner") return acct.partner.slug === partnerSlug ? { partner: acct.partner, isSuper: false } : null;
  return null;
}

export class ForbiddenError extends Error {
  constructor() { super("غير مصرح"); }
}

/** Use at the top of every admin page and server action. Never rely on proxy.ts alone. */
export async function requireAdmin(site: string): Promise<Principal> {
  const h = await headers();
  const p = await authenticate(site, h.get("cookie"));
  if (!p) throw new ForbiddenError();
  return p;
}

export async function requireSuper(site: string): Promise<Principal & { kind: "super" }> {
  const p = await requireAdmin(site);
  if (p.kind !== "super") throw new ForbiddenError();
  return p;
}
