import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { ContentSchema, DeploySchema, ThemeSchema, type Content, type Theme } from "@/lib/schema";
import { sameJson, upgradeContent, validate, type Issue } from "@/lib/content-utils";
import { stampPolls } from "@/lib/poll";
import { ALL_PERMISSIONS, readPermissions, violations, type Permissions } from "@/lib/permissions";
import type { SiteEnv } from "@/lib/environments";
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
  /**
   * The private preview copy (lib/environments.ts). Same as production until an
   * edit is saved to preview; pending = it differs and waits to be published.
   */
  preview: { content: Content; theme: Theme; version: number; pending: boolean; updatedAt: string | null; updatedBy: string | null };
  /** What the teacher's plan includes (lib/permissions.ts). */
  permissions: Permissions;
  /** Free trial sites: when the site stops (null = a normal site). */
  trialEndsAt: string | null;
};

/** A trial site whose time is up: the site shows «انتهت الفترة التجريبية» and its logins are refused. */
export const trialOver = (t: { trialEndsAt: string | null }, now = Date.now()) => Boolean(t.trialEndsAt && Date.parse(t.trialEndsAt) <= now);

/** The content and theme a given environment shows. */
export const copyFor = (t: TenantRecord, env: SiteEnv) => (env === "preview" ? t.preview : { content: t.content, theme: t.theme });

export class ReadOnlyError extends Error {
  constructor() { super("No database configured (DATABASE_URL). Editing is disabled."); }
}
const requireDb = () => { if (!hasDb()) throw new ReadOnlyError(); return db(); };

/**
 * Stored content was valid when it was saved, but fields added to the schema
 * later (with defaults, e.g. students.gallery) are missing from older rows.
 * Parsing on read fills them in. If a row no longer passes (a rule got
 * stricter), it is served as stored rather than taking the site down.
 */
function withDefaults<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  console.warn(`Stored ${what} does not match the current schema; serving it as stored.`);
  return value as T;
}

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
    preview: { content, theme, version: 0, pending: false, updatedAt: null, updatedBy: null },
    permissions: ALL_PERMISSIONS,
    trialEndsAt: null,
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
  const content = withDefaults<Content>(ContentSchema, upgradeContent(row.content), `content for ${slug}`);
  const theme = withDefaults<Theme>(ThemeSchema, row.theme, `theme for ${slug}`);
  const pending = row.previewContent !== null || row.previewTheme !== null;
  return {
    id: row.id, slug: row.slug, name: row.name, status: row.status,
    content, theme, version: row.version,
    domains, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy,
    preview: {
      content: row.previewContent === null ? content : withDefaults<Content>(ContentSchema, upgradeContent(row.previewContent), `preview content for ${slug}`),
      theme: row.previewTheme === null ? theme : withDefaults<Theme>(ThemeSchema, row.previewTheme, `preview theme for ${slug}`),
      version: row.previewVersion,
      pending,
      updatedAt: row.previewUpdatedAt?.toISOString() ?? null,
      updatedBy: row.previewUpdatedBy,
    },
    permissions: readPermissions(row.permissions),
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
  };
}

export type TenantSummary = { slug: string; name: string; status: string; domains: DomainRow[]; users: number; updatedAt: string | null;
  createdAt: string | null;
  /** The live site's language (lib/i18n.ts). */
  locale: string;
  trialEndsAt: string | null;
  /** The partner (agency) the site belongs to, if any. */
  partnerId: string | null };

export async function listTenants(): Promise<TenantSummary[]> {
  if (!hasDb()) {
    return listBundled().map((s) => bundledRecord(s)!).map((t) => ({ slug: t.slug, name: t.name, status: t.status, domains: t.domains, users: 0, updatedAt: null, createdAt: null, locale: t.content.locale, trialEndsAt: null, partnerId: null }));
  }
  const d = db();
  const rows = await d.select({
    id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status, updatedAt: tenants.updatedAt, createdAt: tenants.createdAt,
    // Columns spelled out with their tables: unqualified, "id" would resolve to admin_users.id inside the subquery.
    users: sql<number>`(select count(*)::int from "admin_users" where "admin_users"."tenant_id" = "tenants"."id")`,
    locale: sql<string | null>`"tenants"."content"->>'locale'`,
    trialEndsAt: tenants.trialEndsAt, partnerId: tenants.partnerId,
  }).from(tenants).orderBy(tenants.name);
  const domains = await d.select().from(tenantDomains);
  return rows.map((r) => ({
    slug: r.slug, name: r.name, status: r.status, users: r.users, updatedAt: r.updatedAt.toISOString(), createdAt: r.createdAt.toISOString(), locale: r.locale ?? "ar-EG", trialEndsAt: r.trialEndsAt?.toISOString() ?? null, partnerId: r.partnerId,
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
  const checked = checkPatch(slug, patch);
  if (!checked.ok) return { ok: false, reason: "invalid", issues: checked.issues };
  const { content, theme } = checked;

  return d.transaction(async (tx) => {
    const row = (await tx.select().from(tenants).where(eq(tenants.slug, slug)).for("update").limit(1))[0];
    if (!row) return { ok: false, reason: "missing" } as const;
    if (row.version !== baseVersion) return { ok: false, reason: "conflict", version: row.version } as const;
    // The plan: parts of the site it doesn't include can't be published (the preview still takes them).
    if (content) {
      const blocked = violations(content, withDefaults<Content>(ContentSchema, upgradeContent(row.content), `content for ${slug}`), readPermissions(row.permissions));
      if (blocked.length) return { ok: false, reason: "invalid", issues: blocked } as const;
    }
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

/** Validates a patch (content and/or theme) for a teacher. */
function checkPatch(slug: string, patch: { content?: unknown; theme?: unknown }): { ok: true; content?: Content; theme?: Theme } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = [];
  let content: Content | undefined;
  let theme: Theme | undefined;
  if (patch.content !== undefined) {
    const r = validate(ContentSchema, patch.content);
    // A vote's countdown starts when it's saved, unless it has its own start.
    if (r.ok) content = stampPolls(r.data as Content); else issues.push(...r.issues);
    if (r.ok && content!.slug !== slug) issues.push({ path: "slug", message: "لا يمكن تغيير المعرّف (slug)." });
  }
  if (patch.theme !== undefined) {
    const r = validate(ThemeSchema, patch.theme);
    if (r.ok) theme = r.data as Theme; else issues.push(...r.issues);
  }
  return issues.length ? { ok: false, issues } : { ok: true, content, theme };
}

/**
 * Saves to the private preview copy. baseVersion is the preview version the editor
 * started from (null = don't check). When the result matches production again,
 * the copy is dropped (nothing left to publish).
 */
export async function savePreview(
  slug: string,
  patch: { content?: unknown; theme?: unknown },
  baseVersion: number | null,
  author: string,
  note: string,
): Promise<SaveResult> {
  const d = requireDb();
  const checked = checkPatch(slug, patch);
  if (!checked.ok) return { ok: false, reason: "invalid", issues: checked.issues };
  return d.transaction(async (tx) => {
    const row = (await tx.select().from(tenants).where(eq(tenants.slug, slug)).for("update").limit(1))[0];
    if (!row) return { ok: false, reason: "missing" } as const;
    if (baseVersion !== null && row.previewVersion !== baseVersion) return { ok: false, reason: "conflict", version: row.previewVersion } as const;
    const content = checked.content ?? (row.previewContent ?? row.content) as Content;
    const theme = checked.theme ?? (row.previewTheme ?? row.theme) as Theme;
    const same = sameJson(content, row.content) && sameJson(theme, row.theme);
    const version = row.previewVersion + 1;
    await tx.update(tenants).set({
      previewContent: same ? null : content, previewTheme: same ? null : theme, previewVersion: version,
      previewUpdatedAt: new Date(), previewUpdatedBy: author,
    }).where(eq(tenants.id, row.id));
    await tx.insert(tenantRevisions).values({ tenantId: row.id, version, content, theme, author, note, env: "preview" });
    return { ok: true, version } as const;
  });
}

/** Publishes the preview copy: production becomes what preview shows, and the copy is cleared. */
export async function publishPreview(slug: string, author: string): Promise<SaveResult> {
  const d = requireDb();
  const current = await getTenant(slug);
  if (!current) return { ok: false, reason: "missing" };
  if (!current.preview.pending) return { ok: true, version: current.version };
  const checked = checkPatch(slug, { content: current.preview.content, theme: current.preview.theme });
  if (!checked.ok) return { ok: false, reason: "invalid", issues: checked.issues };
  return d.transaction(async (tx) => {
    const row = (await tx.select().from(tenants).where(eq(tenants.slug, slug)).for("update").limit(1))[0];
    if (!row) return { ok: false, reason: "missing" } as const;
    // Someone saved the preview meanwhile: publish what they see now, not the older copy.
    if (row.previewVersion !== current.preview.version) return { ok: false, reason: "conflict", version: row.previewVersion } as const;
    const blocked = violations(checked.content!, current.content, readPermissions(row.permissions));
    if (blocked.length) return { ok: false, reason: "invalid", issues: blocked } as const;
    const version = row.version + 1;
    await tx.update(tenants).set({
      content: checked.content!, theme: checked.theme!, version, name: checked.content!.profile.name, updatedAt: new Date(), updatedBy: author,
      previewContent: null, previewTheme: null, previewVersion: row.previewVersion + 1, previewUpdatedAt: new Date(), previewUpdatedBy: author,
    }).where(eq(tenants.id, row.id));
    await tx.insert(tenantRevisions).values({ tenantId: row.id, version, content: checked.content!, theme: checked.theme!, author, note: "نشر تعديلات المعاينة" });
    return { ok: true, version } as const;
  });
}

/** Drops the preview copy: preview shows production again. */
export async function discardPreview(slug: string, author: string): Promise<void> {
  const d = requireDb();
  await d.update(tenants).set({
    previewContent: null, previewTheme: null, previewVersion: sql`${tenants.previewVersion} + 1`, previewUpdatedAt: new Date(), previewUpdatedBy: author,
  }).where(eq(tenants.slug, slug));
}

export type RevisionSummary = { id: number; version: number; author: string; note: string | null; createdAt: string; env: SiteEnv };

export async function listRevisions(slug: string, limit = 50): Promise<RevisionSummary[]> {
  if (!hasDb()) return [];
  const rows = await db()
    .select({ id: tenantRevisions.id, version: tenantRevisions.version, author: tenantRevisions.author, note: tenantRevisions.note, createdAt: tenantRevisions.createdAt, env: tenantRevisions.env })
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
    .select({ content: tenantRevisions.content, theme: tenantRevisions.theme, version: tenantRevisions.version, env: tenantRevisions.env })
    .from(tenantRevisions)
    .innerJoin(tenants, eq(tenants.id, tenantRevisions.tenantId))
    .where(and(eq(tenants.slug, slug), eq(tenantRevisions.id, revisionId)))
    .limit(1))[0];
  if (!rev) return { ok: false, reason: "missing" };
  // A preview revision goes back into the preview; a production one into production.
  if (rev.env === "preview") return savePreview(slug, { content: rev.content, theme: rev.theme }, null, author, `استرجاع نسخة المعاينة ${rev.version}`);
  const current = await getTenant(slug);
  if (!current) return { ok: false, reason: "missing" };
  return saveTenant(slug, { content: rev.content, theme: rev.theme }, current.version, author, `استرجاع النسخة ${rev.version}`);
}

/* ------------------------------------------------------------------ */
/* Tenants, domains (platform console)                                 */
/* ------------------------------------------------------------------ */

export async function createTenant(input: {
  slug: string; name: string; content: Content; theme: Theme; author: string;
  /** Free trial: the site stops at this moment, every feature is on until then. */
  trialEndsAt?: Date; signupKey?: string; signupPhone?: string; termsAcceptedAt?: Date;
  /** The partner (agency) the site belongs to. */
  partnerId?: string | null;
  /** Teacher login created in the same transaction. */
  login?: { username: string; passwordHash: string };
}): Promise<void> {
  const d = requireDb();
  const content = { ...input.content, slug: input.slug, profile: { ...input.content.profile, name: input.name } };
  ContentSchema.parse(content);
  ThemeSchema.parse(input.theme);
  await d.transaction(async (tx) => {
    const [row] = await tx.insert(tenants).values({
      slug: input.slug, name: input.name, content, theme: input.theme, updatedBy: input.author,
      ...(input.trialEndsAt ? { trialEndsAt: input.trialEndsAt, signupKey: input.signupKey ?? null, signupPhone: input.signupPhone ?? null, termsAcceptedAt: input.termsAcceptedAt ?? null, permissions: ALL_PERMISSIONS } : {}),
      partnerId: input.partnerId ?? null,
    }).returning({ id: tenants.id });
    if (input.login) await tx.insert(adminUsers).values({ username: input.login.username, passwordHash: input.login.passwordHash, tenantId: row.id });
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

/** The teacher's plan (super admin). */
export async function setPermissions(slug: string, p: Permissions): Promise<void> {
  await requireDb().update(tenants).set({ permissions: p }).where(eq(tenants.slug, slug));
}

export async function setTenantStatus(slug: string, status: "active" | "disabled"): Promise<void> {
  await requireDb().update(tenants).set({ status, updatedAt: new Date() }).where(eq(tenants.slug, slug));
}

/**
 * Deletes a teacher for good: the site, its logins, domains, requests, quizzes,
 * analytics... (every table cascades). Trial requests stay as leads (tenant_id → null).
 * The files are removed separately (storage.ts deleteFolder).
 */
export async function deleteTenant(slug: string): Promise<boolean> {
  const rows = await requireDb().delete(tenants).where(eq(tenants.slug, slug)).returning({ id: tenants.id });
  return rows.length > 0;
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

/** A login the super admin makes: its owner picks their own password at the first login. */
export async function createUser(slug: string, username: string, passwordHash: string): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().insert(adminUsers).values({ username, passwordHash, tenantId: id, mustChangePassword: true });
}

export async function updateUser(slug: string, userId: string, patch: { passwordHash?: string; disabled?: boolean; mustChangePassword?: boolean }): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().update(adminUsers).set(patch).where(and(eq(adminUsers.id, userId), eq(adminUsers.tenantId, id)));
}

export async function deleteUser(slug: string, userId: string): Promise<void> {
  const id = await tenantId(slug);
  await requireDb().delete(adminUsers).where(and(eq(adminUsers.id, userId), eq(adminUsers.tenantId, id)));
}

export async function findLogin(username: string): Promise<{ id: string; hash: string; slug: string; disabled: boolean; mustChange: boolean } | null> {
  if (!hasDb()) return null;
  const row = (await db()
    // A trial whose time is up logs nobody in until it's activated.
    .select({ id: adminUsers.id, hash: adminUsers.passwordHash, slug: tenants.slug, mustChange: adminUsers.mustChangePassword, disabled: sql<boolean>`${adminUsers.disabled} or coalesce(${tenants.trialEndsAt} <= now(), false)` })
    .from(adminUsers)
    .innerJoin(tenants, eq(tenants.id, adminUsers.tenantId))
    .where(eq(adminUsers.username, username))
    .limit(1))[0];
  return row ?? null;
}

/** The same as findLogin, by id: for a signed-in session (lib/server/session.ts). */
export async function findLoginById(id: string): Promise<{ id: string; username: string; slug: string; disabled: boolean } | null> {
  if (!hasDb() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = (await db()
    .select({ id: adminUsers.id, username: adminUsers.username, slug: tenants.slug, disabled: sql<boolean>`${adminUsers.disabled} or coalesce(${tenants.trialEndsAt} <= now(), false)` })
    .from(adminUsers)
    .innerJoin(tenants, eq(tenants.id, adminUsers.tenantId))
    .where(eq(adminUsers.id, id))
    .limit(1))[0];
  return row ?? null;
}

/** The login's owner picked a new password (or kept the old one: hash undefined). */
export async function setOwnPassword(userId: string, passwordHash?: string): Promise<void> {
  await requireDb().update(adminUsers).set({ ...(passwordHash ? { passwordHash } : {}), mustChangePassword: false }).where(eq(adminUsers.id, userId));
}

/** The hash of a login, for checking its current password. */
export async function loginHash(userId: string): Promise<string | null> {
  if (!hasDb() || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return (await db().select({ h: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, userId)).limit(1))[0]?.h ?? null;
}

export async function touchLogin(userId: string): Promise<void> {
  if (!hasDb()) return;
  await db().update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, userId));
}

/* ------------------------------------------------------------------ */
/* Free trials                                                         */
/* ------------------------------------------------------------------ */

/** Ends a trial (null = make it a normal site) or moves its end. */
export async function setTrial(slug: string, endsAt: Date | null): Promise<void> {
  await requireDb().update(tenants).set({ trialEndsAt: endsAt }).where(eq(tenants.slug, slug));
}

/** Records a trial request (the lead) next to the trial site it made (trial_requests). */
export async function addTrialRequest(r: { tenantId: string | null; slug: string; name: string; title: string; subject: string; phone: string; locale: string; username: string; notes: string;
  partnerId?: string | null; extra?: Record<string, string> | null }): Promise<void> {
  await requireDb().insert(schema.trialRequests).values({ ...r, notes: r.notes || null, partnerId: r.partnerId ?? null, extra: r.extra && Object.keys(r.extra).length ? r.extra : null });
}

export type TrialRequestRow = {
  id: string; createdAt: string; slug: string; name: string; title: string | null; subject: string | null; phone: string | null;
  locale: string | null; username: string | null; notes: string | null;
  /** The partner page it was made from (null = the platform's home page), and the answers to its extra fields. */
  partnerId: string | null; extra: Record<string, string> | null;
  /** The trial site, if it still exists. */
  tenant: { status: string; trialEndsAt: string | null } | null;
};

export async function countTrialRequestsSince(since: Date): Promise<number> {
  if (!hasDb()) return 0;
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.trialRequests).where(sql`${schema.trialRequests.createdAt} >= ${since.toISOString()}`);
  return r?.n ?? 0;
}

/** Every trial request, newest first, with the state of its site. */
export async function listTrialRequests(limit = 500): Promise<TrialRequestRow[]> {
  if (!hasDb()) return [];
  const rows = await db().select({
    r: schema.trialRequests, status: tenants.status, trialEndsAt: tenants.trialEndsAt,
  }).from(schema.trialRequests).leftJoin(tenants, eq(tenants.id, schema.trialRequests.tenantId))
    .orderBy(desc(schema.trialRequests.createdAt)).limit(limit);
  return rows.map(({ r, status, trialEndsAt }) => ({
    id: r.id, createdAt: r.createdAt.toISOString(), slug: r.slug, name: r.name, title: r.title, subject: r.subject, phone: r.phone,
    locale: r.locale, username: r.username, notes: r.notes, partnerId: r.partnerId, extra: (r.extra as Record<string, string> | null) ?? null,
    tenant: status ? { status, trialEndsAt: trialEndsAt?.toISOString() ?? null } : null,
  }));
}

/** How many trial sites were made in the last day and in the last `recentMinutes`, by one visitor (key) and in total. */
export async function recentSignups(key: string, recentMinutes: number): Promise<{ mineDay: number; mineRecent: number; allDay: number; allHour: number }> {
  const recent = new Date(Date.now() - recentMinutes * 60_000).toISOString();
  const hour = new Date(Date.now() - 3600_000).toISOString();
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [r] = await requireDb().select({
    mineDay: sql<number>`count(*) filter (where ${tenants.signupKey} = ${key})::int`,
    mineRecent: sql<number>`count(*) filter (where ${tenants.signupKey} = ${key} and ${tenants.createdAt} >= ${recent})::int`,
    allDay: sql<number>`count(*)::int`,
    allHour: sql<number>`count(*) filter (where ${tenants.createdAt} >= ${hour})::int`,
  }).from(tenants).where(sql`${tenants.signupKey} is not null and ${tenants.createdAt} >= ${day}`);
  return r ?? { mineDay: 0, mineRecent: 0, allDay: 0, allHour: 0 };
}

export async function slugTaken(slug: string): Promise<boolean> {
  if (!hasDb()) return listBundled().includes(slug);
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1)).length > 0;
}

/** Teacher and partner logins share one name space (one login page for both). */
export async function usernameTaken(username: string): Promise<boolean> {
  if (!hasDb()) return false;
  const d = db();
  const [a, p] = await Promise.all([
    d.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.username, username)).limit(1),
    d.select({ id: schema.partners.id }).from(schema.partners).where(eq(schema.partners.username, username)).limit(1),
  ]);
  return a.length + p.length > 0;
}
