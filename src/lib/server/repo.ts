import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { ContentSchema, DeploySchema, ThemeSchema, type Content, type Theme } from "@/lib/schema";
import { validate, type Issue } from "@/lib/content-utils";
import { listBundled, readBundledJson } from "./bundled";

const { tenants, tenantDomains, adminUsers, tenantRevisions } = schema;

export type DomainRow = { domain: string; isPrimary: boolean };
export type TenantRecord = {
  id: string | null;
  slug: string;
  name: string;
  status: "active" | "disabled";
  content: Content;
  theme: Theme;
  version: number;
  domains: DomainRow[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export class ReadOnlyError extends Error {
  constructor() { super("No database configured (DATABASE_URL). Editing is disabled."); }
}
const requireDb = () => { if (!hasDb()) throw new ReadOnlyError(); return db(); };

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

function bundledRecord(slug: string): TenantRecord | null {
  if (!listBundled().includes(slug)) return null;
  const content = ContentSchema.parse(readBundledJson(slug, "content.json"));
  const theme = ThemeSchema.parse(readBundledJson(slug, "theme.json"));
  const deploy = DeploySchema.parse(readBundledJson(slug, "deploy.json"));
  return {
    id: null, slug, name: content.profile.name, status: deploy.enabled ? "active" : "disabled",
    content, theme, version: 0,
    domains: deploy.domains.map((d, i) => ({ domain: d, isPrimary: i === 0 })),
    updatedAt: null, updatedBy: null,
  };
}

export async function findSlugByDomain(domain: string): Promise<string | null> {
  if (!hasDb()) {
    return listBundled().find((s) => bundledRecord(s)?.domains.some((d) => d.domain === domain)) ?? null;
  }
  const rows = await db()
    .select({ slug: tenants.slug })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenants.id, tenantDomains.tenantId))
    .where(eq(tenantDomains.domain, domain))
    .limit(1);
  return rows[0]?.slug ?? null;
}

export async function getTenant(slug: string): Promise<TenantRecord | null> {
  if (!hasDb()) return bundledRecord(slug);
  const d = db();
  const row = (await d.select().from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  if (!row) return null;
  const domains = await d
    .select({ domain: tenantDomains.domain, isPrimary: tenantDomains.isPrimary })
    .from(tenantDomains)
    .where(eq(tenantDomains.tenantId, row.id))
    .orderBy(desc(tenantDomains.isPrimary), tenantDomains.domain);
  return {
    id: row.id, slug: row.slug, name: row.name, status: row.status,
    content: row.content as Content, theme: row.theme as Theme, version: row.version,
    domains, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy,
  };
}

export type TenantSummary = { slug: string; name: string; status: string; domains: DomainRow[]; users: number; updatedAt: string | null };

export async function listTenants(): Promise<TenantSummary[]> {
  if (!hasDb()) {
    return listBundled().map((s) => bundledRecord(s)!).map((t) => ({ slug: t.slug, name: t.name, status: t.status, domains: t.domains, users: 0, updatedAt: null }));
  }
  const d = db();
  const rows = await d.select({
    id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status, updatedAt: tenants.updatedAt,
    users: sql<number>`(select count(*)::int from ${adminUsers} where ${adminUsers.tenantId} = ${tenants.id})`,
  }).from(tenants).orderBy(tenants.name);
  const domains = await d.select().from(tenantDomains);
  return rows.map((r) => ({
    slug: r.slug, name: r.name, status: r.status, users: r.users, updatedAt: r.updatedAt.toISOString(),
    domains: domains.filter((x) => x.tenantId === r.id).map((x) => ({ domain: x.domain, isPrimary: x.isPrimary }))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
  }));
}

/* ------------------------------------------------------------------ */
/* Content writes                                                      */
/* ------------------------------------------------------------------ */

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: "invalid"; issues: Issue[] }
  | { ok: false; reason: "conflict"; version: number }
  | { ok: false; reason: "missing" };

/**
 * Saves content and/or theme for a teacher. Validates against the Zod schemas,
 * refuses to overwrite a newer version (two people editing at once), and keeps a revision.
 */
export async function saveTenant(
  slug: string,
  patch: { content?: unknown; theme?: unknown },
  baseVersion: number,
  author: string,
  note: string,
): Promise<SaveResult> {
  const d = requireDb();
  const issues: Issue[] = [];
  let content: Content | undefined;
  let theme: Theme | undefined;
  if (patch.content !== undefined) {
    const r = validate(ContentSchema, patch.content);
    if (r.ok) content = r.data as Content; else issues.push(...r.issues);
    if (r.ok && content!.slug !== slug) issues.push({ path: "slug", message: "لا يمكن تغيير المعرّف (slug)." });
  }
  if (patch.theme !== undefined) {
    const r = validate(ThemeSchema, patch.theme);
    if (r.ok) theme = r.data as Theme; else issues.push(...r.issues);
  }
  if (issues.length) return { ok: false, reason: "invalid", issues };

  return d.transaction(async (tx) => {
    const row = (await tx.select().from(tenants).where(eq(tenants.slug, slug)).for("update").limit(1))[0];
    if (!row) return { ok: false, reason: "missing" } as const;
    if (row.version !== baseVersion) return { ok: false, reason: "conflict", version: row.version } as const;
    const next = {
      content: content ?? (row.content as Content),
      theme: theme ?? (row.theme as Theme),
      version: row.version + 1,
    };
    await tx.update(tenants).set({
      content: next.content, theme: next.theme, version: next.version,
      name: next.content.profile.name, updatedAt: new Date(), updatedBy: author,
    }).where(eq(tenants.id, row.id));
    await tx.insert(tenantRevisions).values({ tenantId: row.id, version: next.version, content: next.content, theme: next.theme, author, note });
    return { ok: true, version: next.version } as const;
  });
}

export type RevisionSummary = { id: number; version: number; author: string; note: string | null; createdAt: string };

export async function listRevisions(slug: string, limit = 50): Promise<RevisionSummary[]> {
  if (!hasDb()) return [];
  const rows = await db()
    .select({ id: tenantRevisions.id, version: tenantRevisions.version, author: tenantRevisions.author, note: tenantRevisions.note, createdAt: tenantRevisions.createdAt })
    .from(tenantRevisions)
    .innerJoin(tenants, eq(tenants.id, tenantRevisions.tenantId))
    .where(eq(tenants.slug, slug))
    .orderBy(desc(tenantRevisions.createdAt), desc(tenantRevisions.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function restoreRevision(slug: string, revisionId: number, author: string): Promise<SaveResult> {
  const d = requireDb();
  const rev = (await d
    .select({ content: tenantRevisions.content, theme: tenantRevisions.theme, version: tenantRevisions.version })
    .from(tenantRevisions)
    .innerJoin(tenants, eq(tenants.id, tenantRevisions.tenantId))
    .where(and(eq(tenants.slug, slug), eq(tenantRevisions.id, revisionId)))
    .limit(1))[0];
  if (!rev) return { ok: false, reason: "missing" };
  const current = await getTenant(slug);
  if (!current) return { ok: false, reason: "missing" };
  return saveTenant(slug, { content: rev.content, theme: rev.theme }, current.version, author, `استرجاع النسخة ${rev.version}`);
}

/* ------------------------------------------------------------------ */
/* Tenants, domains (platform console)                                 */
/* ------------------------------------------------------------------ */

export async function createTenant(input: { slug: string; name: string; content: Content; theme: Theme; author: string }): Promise<void> {
  const d = requireDb();
  const content = { ...input.content, slug: input.slug, profile: { ...input.content.profile, name: input.name } };
  ContentSchema.parse(content);
  ThemeSchema.parse(input.theme);
  await d.transaction(async (tx) => {
    const [row] = await tx.insert(tenants).values({ slug: input.slug, name: input.name, content, theme: input.theme, updatedBy: input.author }).returning({ id: tenants.id });
    await tx.insert(tenantRevisions).values({ tenantId: row.id, version: 1, content, theme: input.theme, author: input.author, note: "إنشاء" });
  });
}

/** Insert or overwrite a teacher from the bundled /tenants folder. */
export async function upsertBundledTenant(slug: string, author: string, overwrite: boolean): Promise<"created" | "updated" | "skipped"> {
  const d = requireDb();
  const rec = bundledRecord(slug);
  if (!rec) throw new Error(`Bundled tenant ${slug} not found.`);
  const existing = await getTenant(slug);
  if (existing && !overwrite) return "skipped";
  if (!existing) {
    await createTenant({ slug, name: rec.name, content: rec.content, theme: rec.theme, author });
  } else {
    const r = await saveTenant(slug, { content: rec.content, theme: rec.theme }, existing.version, author, "استيراد من المستودع");
    if (!r.ok) throw new Error(`Import of ${slug} failed: ${JSON.stringify(r)}`);
  }
  for (const dom of rec.domains) {
    await d.insert(tenantDomains).values({ domain: dom.domain, tenantId: (await getTenant(slug))!.id!, isPrimary: dom.isPrimary }).onConflictDoNothing();
  }
  return existing ? "updated" : "created";
}

export async function setTenantStatus(slug: string, status: "active" | "disabled"): Promise<void> {
  await requireDb().update(tenants).set({ status, updatedAt: new Date() }).where(eq(tenants.slug, slug));
}

async function tenantId(slug: string): Promise<string> {
  const row = (await requireDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  if (!row) throw new Error("Teacher not found.");
  return row.id;
}

export const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function addDomain(slug: string, domain: string): Promise<void> {
  const d = requireDb();
  const id = await tenantId(slug);
  const hasPrimary = (await d.select().from(tenantDomains).where(and(eq(tenantDomains.tenantId, id), eq(tenantDomains.isPrimary, true)))).length > 0;
  await d.insert(tenantDomains).values({ domain, tenantId: id, isPrimary: !hasPrimary });
}

export async function removeDomain(slug: string, domain: string): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().delete(tenantDomains).where(and(eq(tenantDomains.tenantId, id), eq(tenantDomains.domain, domain)));
}

export async function makePrimaryDomain(slug: string, domain: string): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().transaction(async (tx) => {
    await tx.update(tenantDomains).set({ isPrimary: false }).where(eq(tenantDomains.tenantId, id));
    await tx.update(tenantDomains).set({ isPrimary: true }).where(and(eq(tenantDomains.tenantId, id), eq(tenantDomains.domain, domain)));
  });
}

/* ------------------------------------------------------------------ */
/* Teacher logins                                                      */
/* ------------------------------------------------------------------ */

export type UserRow = { id: string; username: string; disabled: boolean; createdAt: string; lastLoginAt: string | null };

export async function listUsers(slug: string): Promise<UserRow[]> {
  if (!hasDb()) return [];
  const rows = await db()
    .select({ id: adminUsers.id, username: adminUsers.username, disabled: adminUsers.disabled, createdAt: adminUsers.createdAt, lastLoginAt: adminUsers.lastLoginAt })
    .from(adminUsers)
    .innerJoin(tenants, eq(tenants.id, adminUsers.tenantId))
    .where(eq(tenants.slug, slug))
    .orderBy(adminUsers.username);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lastLoginAt: r.lastLoginAt?.toISOString() ?? null }));
}

export async function createUser(slug: string, username: string, passwordHash: string): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().insert(adminUsers).values({ username, passwordHash, tenantId: id });
}

export async function updateUser(slug: string, userId: string, patch: { passwordHash?: string; disabled?: boolean }): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().update(adminUsers).set(patch).where(and(eq(adminUsers.id, userId), eq(adminUsers.tenantId, id)));
}

export async function deleteUser(slug: string, userId: string): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().delete(adminUsers).where(and(eq(adminUsers.id, userId), eq(adminUsers.tenantId, id)));
}

export async function findLogin(username: string): Promise<{ id: string; hash: string; slug: string; disabled: boolean } | null> {
  if (!hasDb()) return null;
  const row = (await db()
    .select({ id: adminUsers.id, hash: adminUsers.passwordHash, slug: tenants.slug, disabled: adminUsers.disabled })
    .from(adminUsers)
    .innerJoin(tenants, eq(tenants.id, adminUsers.tenantId))
    .where(eq(adminUsers.username, username))
    .limit(1))[0];
  return row ?? null;
}

export async function touchLogin(userId: string): Promise<void> {
  if (!hasDb()) return;
  await db().update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, userId));
}
