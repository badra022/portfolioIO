"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isPlatformHost } from "@/lib/routing";
import { sectionById } from "@/lib/admin/sections";
import type { Content, Theme } from "@/lib/schema";
import { ForbiddenError, principalName, requireAdmin, requireSuper, type Principal } from "@/lib/server/auth";
import { DOMAINS_TAG, slugForSite, tenantTag } from "@/lib/server/site";
import { assetUrl } from "@/lib/server/assets";
import { listBundled, readBundledAssets } from "@/lib/server/bundled";
import { ensureBucket, putObject } from "@/lib/server/storage";
import { ImageError, SLUG_RE, USERNAME_RE, loginUrlFor, normalizeDomain, storeImage } from "@/lib/server/admin-ops";
import { generatePassword, hashPassword } from "@/lib/server/passwords";
import { mapImages } from "@/lib/content-utils";
import * as repo from "@/lib/server/repo";
import * as submissionsRepo from "@/lib/server/submissions";

type Fail = { ok: false; reason: "forbidden" | "missing" | "error"; message?: string };

/** Authenticates the caller for a teacher site and returns the teacher's slug. */
async function teacherContext(site: string): Promise<{ p: Principal; slug: string } | Fail> {
  let p: Principal;
  try { p = await requireAdmin(site); } catch { return { ok: false, reason: "forbidden" }; }
  const slug = await slugForSite(site);
  if (!slug) return { ok: false, reason: "missing" };
  if (p.kind === "teacher" && p.slug !== slug) return { ok: false, reason: "forbidden" };
  return { p, slug };
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

export async function saveSectionAction(site: string, sectionId: string, value: unknown, baseVersion: number): Promise<repo.SaveResult | Fail> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return ctx;
  const section = sectionById(sectionId);
  if (!section) return { ok: false, reason: "missing" };
  if (section.superOnly && ctx.p.kind !== "super") return { ok: false, reason: "forbidden" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "error", message: "بيانات غير صالحة." };

  try {
    const current = await repo.getTenant(ctx.slug);
    if (!current) return { ok: false, reason: "missing" };
    let patch: { content?: unknown; theme?: unknown };
    if (section.theme) {
      patch = { theme: value };
    } else {
      const content = { ...current.content } as Record<string, unknown>;
      const incoming = value as Record<string, unknown>;
      for (const k of section.keys ?? []) {
        if (incoming[k] === undefined) delete content[k];
        else content[k] = incoming[k];
      }
      patch = { content };
    }
    const r = await repo.saveTenant(ctx.slug, patch, baseVersion, principalName(ctx.p), section.title);
    if (r.ok) updateTag(tenantTag(ctx.slug));
    return r;
  } catch (e) {
    console.error(e);
    return { ok: false, reason: "error", message: e instanceof repo.ReadOnlyError ? "لا توجد قاعدة بيانات متصلة." : "حدث خطأ أثناء الحفظ." };
  }
}

export async function uploadImageAction(site: string, form: FormData): Promise<{ ok: true; key: string; url: string } | { ok: false; error: string }> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return { ok: false, error: "غير مصرح." };
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "لم يتم اختيار ملف." };
  try {
    return { ok: true, ...(await storeImage(ctx.slug, new Uint8Array(await file.arrayBuffer()), file.type)) };
  } catch (e) {
    if (e instanceof ImageError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "تعذّر رفع الصورة." };
  }
}

export async function restoreRevisionAction(site: string, revisionId: number): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  const r = await repo.restoreRevision(ctx.slug, revisionId, principalName(ctx.p));
  if (r.ok) updateTag(tenantTag(ctx.slug));
  refresh();
}

/* ------------------------------------------------------------------ */
/* Platform console (super admin only)                                 */
/* ------------------------------------------------------------------ */

const PLATFORM = "_platform";

export type ConsoleState = { ok: boolean; message: string; lines?: string[]; secret?: { username: string; password: string; loginUrl?: string } } | null;

export async function importBundledAction(_prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  const p = await requireSuper(PLATFORM);
  const overwrite = form.get("overwrite") === "on";
  const lines: string[] = [];
  try {
    await ensureBucket();
    for (const slug of listBundled()) {
      const result = await repo.upsertBundledTenant(slug, principalName(p), overwrite);
      lines.push(`${slug}: ${result === "created" ? "تمت الإضافة" : result === "updated" ? "تم التحديث" : "موجود بالفعل (لم يتغير)"}`);
      if (result !== "skipped") {
        const assets = readBundledAssets(slug);
        for (const a of assets) await putObject(slug, a.name, a.bytes, a.contentType, 3600);
        lines.push(`${slug}: رفع ${assets.length} ملف`);
      }
      updateTag(tenantTag(slug));
    }
    updateTag(DOMAINS_TAG);
    refresh();
    return { ok: true, message: "تم الاستيراد.", lines };
  } catch (e) {
    console.error(e);
    return { ok: false, message: e instanceof Error ? e.message : "فشل الاستيراد.", lines };
  }
}

export async function createTenantAction(_prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  const p = await requireSuper(PLATFORM);
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const source = String(form.get("source") ?? "");
  if (!SLUG_RE.test(slug)) return { ok: false, message: "المعرّف: حروف إنجليزية صغيرة وأرقام وشرطة فقط." };
  if (!name) return { ok: false, message: "اكتب اسم المدرس." };
  if (await repo.getTenant(slug)) return { ok: false, message: "هذا المعرّف مستخدم بالفعل." };
  const sourceSlug = source.replace(/^tenant:/, "");
  const from = await repo.getTenant(sourceSlug);
  if (!from) return { ok: false, message: "اختر مدرساً لنسخ القالب منه." };
  // Images keep pointing at the source teacher's files until replaced.
  const content = mapImages(from.content, (v) => assetUrl(sourceSlug, v)) as Content;
  try {
    await repo.createTenant({ slug, name, content, theme: from.theme as Theme, author: principalName(p) });
  } catch (e) {
    console.error(e);
    return { ok: false, message: "تعذّر إنشاء المدرس." };
  }
  redirect(`/admin/tenants/${slug}`);
}

export async function addDomainAction(slug: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!repo.DOMAIN_RE.test(domain)) return { ok: false, message: "اكتب دومين صحيح مثل mohamedali.com" };
  if (isPlatformHost(domain, env.rootDomain, env.platformHosts)) return { ok: false, message: "هذا الدومين محجوز للمنصة." };
  try {
    await repo.addDomain(slug, domain);
  } catch {
    return { ok: false, message: "الدومين مستخدم بالفعل." };
  }
  updateTag(DOMAINS_TAG);
  updateTag(tenantTag(slug));
  refresh();
  return { ok: true, message: `تمت إضافة ${domain}. أضفه أيضاً في Vercel (Settings → Domains).` };
}

export async function removeDomainAction(slug: string, domain: string): Promise<void> {
  await requireSuper(PLATFORM);
  await repo.removeDomain(slug, domain);
  updateTag(DOMAINS_TAG);
  updateTag(tenantTag(slug));
  refresh();
}

export async function primaryDomainAction(slug: string, domain: string): Promise<void> {
  await requireSuper(PLATFORM);
  await repo.makePrimaryDomain(slug, domain);
  updateTag(tenantTag(slug));
  refresh();
}

export async function setStatusAction(slug: string, status: "active" | "disabled"): Promise<void> {
  await requireSuper(PLATFORM);
  await repo.setTenantStatus(slug, status);
  updateTag(tenantTag(slug));
  refresh();
}

export async function createUserAction(slug: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return { ok: false, message: "اسم المستخدم: 3-32 حرف إنجليزي صغير أو أرقام أو . _ -" };
  const password = generatePassword();
  try {
    await repo.createUser(slug, username, await hashPassword(password));
  } catch {
    return { ok: false, message: "اسم المستخدم مستخدم بالفعل." };
  }
  refresh();
  return { ok: true, message: "تم إنشاء الحساب. انسخ كلمة المرور الآن، لن تظهر مرة أخرى.", secret: { username, password, loginUrl: await loginUrlFor(slug) } };
}

export async function resetPasswordAction(slug: string, userId: string, username: string, _prev: ConsoleState): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const password = generatePassword();
  await repo.updateUser(slug, userId, { passwordHash: await hashPassword(password) });
  return { ok: true, message: "كلمة مرور جديدة. انسخها الآن، لن تظهر مرة أخرى.", secret: { username, password, loginUrl: await loginUrlFor(slug) } };
}

export async function setUserDisabledAction(slug: string, userId: string, disabled: boolean): Promise<void> {
  await requireSuper(PLATFORM);
  await repo.updateUser(slug, userId, { disabled });
  refresh();
}

export async function deleteUserAction(slug: string, userId: string): Promise<void> {
  await requireSuper(PLATFORM);
  await repo.deleteUser(slug, userId);
  refresh();
}

/* ------------------------------------------------------------------ */
/* Form requests (/admin/requests)                                     */
/* ------------------------------------------------------------------ */

export async function setRequestStatusAction(site: string, ids: number[], status: submissionsRepo.StatusT): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  if (!submissionsRepo.STATUSES.includes(status)) return;
  await submissionsRepo.setStatus(ctx.slug, ids.filter(Number.isInteger), status);
  refresh();
}

export async function deleteRequestAction(site: string, ids: number[]): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  await submissionsRepo.deleteSubmissions(ctx.slug, ids.filter(Number.isInteger));
  refresh();
}
