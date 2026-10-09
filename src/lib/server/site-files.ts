import "server-only";
import { and, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import { MAX_SITE_FILE, isSiteFileName } from "@/lib/site-files";
import { slugForSite } from "./site";

const { tenantFiles, tenants } = schema;

/** Cache tag for one teacher's site files; saving or deleting a file clears it. */
export const filesTag = (slug: string) => `files:${slug}`;

export type SiteFile = { name: string; size: number; updatedAt: string; updatedBy: string | null };

export class SiteFileError extends Error {}

async function tenantIdOf(slug: string): Promise<string> {
  const id = (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id;
  if (!id) throw new SiteFileError("Teacher not found.");
  return id;
}

export async function listSiteFiles(slug: string): Promise<SiteFile[]> {
  if (!hasDb()) return [];
  const rows = await db().select({ name: tenantFiles.name, content: tenantFiles.content, updatedAt: tenantFiles.updatedAt, updatedBy: tenantFiles.updatedBy })
    .from(tenantFiles).innerJoin(tenants, eq(tenants.id, tenantFiles.tenantId))
    .where(eq(tenants.slug, slug)).orderBy(tenantFiles.name);
  return rows.map((r) => ({ name: r.name, size: Buffer.byteLength(r.content), updatedAt: r.updatedAt.toISOString(), updatedBy: r.updatedBy }));
}

/** Adds or replaces a file. Names and sizes are checked; the content is stored as given (text). */
export async function putSiteFile(slug: string, rawName: string, content: string, author: string): Promise<string> {
  const name = rawName.trim().replace(/^\/+/, "");
  if (!isSiteFileName(name)) throw new SiteFileError("اسم ملف غير مسموح. أمثلة: google123.html أو BingSiteAuth.xml أو ads.txt أو .well-known/security.txt");
  if (Buffer.byteLength(content) > MAX_SITE_FILE) throw new SiteFileError("الملف أكبر من 64 كيلوبايت. الملفات دي المفروض تكون نص صغير.");
  if (content.includes("\u0000")) throw new SiteFileError("الملف لازم يكون نص (مش صورة أو ملف تنفيذي).");
  const tenantId = await tenantIdOf(slug);
  await db().insert(tenantFiles).values({ tenantId, name, content, updatedBy: author })
    .onConflictDoUpdate({ target: [tenantFiles.tenantId, tenantFiles.name], set: { content, updatedBy: author, updatedAt: new Date() } });
  return name;
}

export async function deleteSiteFile(slug: string, name: string): Promise<void> {
  const tenantId = await tenantIdOf(slug);
  await db().delete(tenantFiles).where(and(eq(tenantFiles.tenantId, tenantId), eq(tenantFiles.name, name)));
}

/** The file a site serves at /<name>, or null. Cached per site until the teacher's files change. */
export async function siteFileFor(site: string, name: string): Promise<string | null> {
  "use cache";
  cacheLife("days");
  if (!hasDb() || !isSiteFileName(name)) return null;
  const slug = await slugForSite(site);
  if (!slug) return null;
  cacheTag(filesTag(slug));
  const row = (await db().select({ content: tenantFiles.content })
    .from(tenantFiles).innerJoin(tenants, eq(tenants.id, tenantFiles.tenantId))
    .where(and(eq(tenants.slug, slug), eq(tenantFiles.name, name), eq(tenants.status, "active"))).limit(1))[0];
  return row?.content ?? null;
}
