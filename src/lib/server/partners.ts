import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { readPartnerForm, type PartnerForm } from "@/lib/partners";
import { hashPassword, verifyPassword } from "./passwords";

const { partners, tenants } = schema;

/**
 * Partners: marketing agencies with a private sign-up page at <platform>/<slug>
 * (behind their own login) that builds unlimited trial sites for their clients,
 * and the same login manages every site that belongs to them (lib/server/auth.ts).
 * The super admin adds them in admin/partners.
 */
export type Partner = {
  id: string; slug: string; name: string; username: string; disabled: boolean;
  trialHours: number; form: PartnerForm; notes: string | null; createdAt: string; lastLoginAt: string | null;
};

type Row = typeof partners.$inferSelect;
const toPartner = (r: Row): Partner => ({
  id: r.id, slug: r.slug, name: r.name, username: r.username, disabled: r.disabled, trialHours: r.trialHours,
  form: readPartnerForm(r.form), notes: r.notes, createdAt: r.createdAt.toISOString(), lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
});

export const TRIAL_HOURS_MAX = 24 * 30;

export async function listPartners(): Promise<Partner[]> {
  if (!hasDb()) return [];
  return (await db().select().from(partners).orderBy(partners.name)).map(toPartner);
}

export async function getPartner(slug: string): Promise<Partner | null> {
  if (!hasDb()) return null;
  const r = (await db().select().from(partners).where(eq(partners.slug, slug)).limit(1))[0];
  return r ? toPartner(r) : null;
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  if (!hasDb()) return null;
  const r = (await db().select().from(partners).where(eq(partners.id, id)).limit(1))[0];
  return r ? toPartner(r) : null;
}

export async function createPartner(input: { slug: string; name: string; username: string; password: string; trialHours: number; notes: string }): Promise<void> {
  await db().insert(partners).values({
    slug: input.slug, name: input.name, username: input.username, passwordHash: await hashPassword(input.password),
    trialHours: input.trialHours, notes: input.notes || null,
  });
  slugs = null;
}

export async function updatePartner(id: string, patch: Partial<{ slug: string; name: string; username: string; password: string; disabled: boolean; trialHours: number; form: PartnerForm; notes: string }>): Promise<void> {
  const { password, notes, ...rest } = patch;
  await db().update(partners).set({
    ...rest,
    ...(notes !== undefined ? { notes: notes || null } : {}),
    ...(password ? { passwordHash: await hashPassword(password) } : {}),
  }).where(eq(partners.id, id));
  slugs = null;
}

/** Removes the partner; its teachers and trial requests stay, with no partner. */
export async function deletePartner(id: string): Promise<void> {
  await db().delete(partners).where(eq(partners.id, id));
  slugs = null;
}

export async function partnerUsernameTaken(username: string, exceptId?: string): Promise<boolean> {
  if (!hasDb()) return false;
  const r = (await db().select({ id: partners.id }).from(partners).where(eq(partners.username, username)).limit(1))[0];
  return Boolean(r && r.id !== exceptId);
}

/* Which first path segments on the platform host are partner pages (for proxy.ts), remembered for a minute. */
let slugs: { set: Set<string>; until: number } | null = null;
export async function partnerSlugs(): Promise<Set<string>> {
  if (slugs && slugs.until > Date.now()) return slugs.set;
  if (!hasDb()) return new Set();
  const rows = await db().select({ slug: partners.slug }).from(partners).catch(() => [] as { slug: string }[]);
  slugs = { set: new Set(rows.map((r) => r.slug)), until: Date.now() + 60_000 };
  return slugs.set;
}

// A burned-in hash so unknown usernames cost the same time as known ones.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** The partner these credentials belong to (not disabled), or null. Usernames are matched lowercase, like teachers'. */
export async function checkPartner(creds: { user: string; pass: string }): Promise<Partner | null> {
  if (!hasDb()) return null;
  const username = creds.user.trim().toLowerCase();
  const r = username ? (await db().select().from(partners).where(eq(partners.username, username)).limit(1))[0] : undefined;
  const ok = await verifyPassword(creds.pass.trim(), r?.passwordHash ?? DUMMY_HASH);
  if (!ok || !r || r.disabled) return null;
  await db().update(partners).set({ lastLoginAt: new Date() }).where(eq(partners.id, r.id)).catch(() => {});
  return toPartner(r);
}

/** The partner a teacher site belongs to (its id), or null. */
export async function partnerIdOf(slug: string): Promise<string | null> {
  if (!hasDb()) return null;
  const r = (await db().select({ p: tenants.partnerId }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  return r?.p ?? null;
}

export async function setTenantPartner(slug: string, partnerId: string | null): Promise<void> {
  await db().update(tenants).set({ partnerId }).where(eq(tenants.slug, slug));
}

/** Every site of a partner, newest first (its page lists them). */
export async function partnerSites(partnerId: string): Promise<{ slug: string; name: string; status: string; trialEndsAt: string | null; createdAt: string }[]> {
  if (!hasDb()) return [];
  const rows = await db().select({ slug: tenants.slug, name: tenants.name, status: tenants.status, trialEndsAt: tenants.trialEndsAt, createdAt: tenants.createdAt })
    .from(tenants).where(eq(tenants.partnerId, partnerId)).orderBy(desc(tenants.createdAt));
  return rows.map((r) => ({ ...r, trialEndsAt: r.trialEndsAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}

/** How many trials a partner made in the last hour and day (a safety cap, not a quota). */
export async function partnerTrialsSince(partnerId: string, hours: number): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.trialRequests)
    .where(sql`${schema.trialRequests.partnerId} = ${partnerId} and ${schema.trialRequests.createdAt} >= ${since}`);
  return r?.n ?? 0;
}

/**
 * The partner whose page (<platform>/<slug>) a request is for, when the caller may use it:
 * that partner's own login or the super admin. proxy.ts checks the same before the page loads.
 */
export async function partnerForRequest(site: string, slug: string, authorization: string | null): Promise<Partner | null> {
  if (site !== "_platform") return null;
  const { authenticatePartner } = await import("./auth");
  const who = await authenticatePartner(authorization, slug);
  if (!who) return null;
  const partner = who.partner ?? (await getPartner(slug));
  return partner && !partner.disabled ? partner : null;
}
