"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { baseForSite, isPlatformHost } from "@/lib/routing";
import { sectionById } from "@/lib/admin/sections";
import type { Content, Theme } from "@/lib/schema";
import { isEnv, type SiteEnv } from "@/lib/environments";
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
import * as quizRepo from "@/lib/server/quiz-attempts";
import * as siteFiles from "@/lib/server/site-files";
import * as results from "@/lib/server/exam-results";
import { MAX_SITE_FILE } from "@/lib/site-files";

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

export type SectionSaved = { ok: true; version: number; previewVersion: number; pending: boolean };

/** Puts one editor page's value into a full content/theme (the other sections stay as they are in that copy). */
function withSection(section: NonNullable<ReturnType<typeof sectionById>>, copy: { content: Content; theme: Theme }, value: Record<string, unknown>): { content?: unknown; theme?: unknown } {
  if (section.theme) return { theme: value };
  const content = { ...copy.content } as Record<string, unknown>;
  for (const k of section.keys ?? []) {
    if (value[k] === undefined) delete content[k];
    else content[k] = value[k];
  }
  return { content };
}

/**
 * Saves one editor page to the private preview, or to production (the public
 * site). Saving to production also puts the same change into the preview copy, so
 * the preview keeps showing everything that's live plus what's still unpublished.
 */
export async function saveSectionAction(
  site: string,
  sectionId: string,
  value: unknown,
  versions: { production: number; preview: number },
  target: SiteEnv,
): Promise<SectionSaved | Exclude<repo.SaveResult, { ok: true }> | Fail> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return ctx;
  const section = sectionById(sectionId);
  if (!section) return { ok: false, reason: "missing" };
  if (section.superOnly && ctx.p.kind !== "super") return { ok: false, reason: "forbidden" };
  if (!value || typeof value !== "object" || Array.isArray(value) || !isEnv(target)) return { ok: false, reason: "error", message: "بيانات غير صالحة." };
  const v = value as Record<string, unknown>;
  const author = principalName(ctx.p);

  try {
    const current = await repo.getTenant(ctx.slug);
    if (!current) return { ok: false, reason: "missing" };
    if (target === "preview") {
      const r = await repo.savePreview(ctx.slug, withSection(section, current.preview, v), versions.preview, author, section.title);
      if (!r.ok) return r;
      updateTag(tenantTag(ctx.slug));
      const after = await repo.getTenant(ctx.slug);
      return { ok: true, version: current.version, previewVersion: r.version, pending: after?.preview.pending ?? true };
    }
    const r = await repo.saveTenant(ctx.slug, withSection(section, current, v), versions.production, author, section.title);
    if (!r.ok) return r;
    let previewVersion = current.preview.version;
    if (current.preview.pending) {
      const p = await repo.savePreview(ctx.slug, withSection(section, current.preview, v), null, author, `${section.title} (منشور على الموقع)`);
      if (p.ok) previewVersion = p.version;
    }
    updateTag(tenantTag(ctx.slug));
    const after = await repo.getTenant(ctx.slug);
    return { ok: true, version: r.version, previewVersion, pending: after?.preview.pending ?? false };
  } catch (e) {
    console.error(e);
    return { ok: false, reason: "error", message: e instanceof repo.ReadOnlyError ? "لا توجد قاعدة بيانات متصلة." : "حدث خطأ أثناء الحفظ." };
  }
}

/** Publishes everything saved to the preview: the public site becomes what the preview shows. */
export async function publishPreviewAction(site: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return { ok: false, message: "غير مصرح." };
  try {
    const r = await repo.publishPreview(ctx.slug, principalName(ctx.p));
    if (!r.ok) {
      if (r.reason === "invalid") return { ok: false, message: `المعاينة فيها بيانات محتاجة تصحيح: ${r.issues.slice(0, 3).map((i) => i.path).join("، ")}` };
      if (r.reason === "conflict") return { ok: false, message: "حد عدّل المعاينة من شوية. حدّث الصفحة وراجعها تاني قبل النشر." };
      return { ok: false, message: "المدرس مش موجود." };
    }
  } catch (e) {
    console.error(e);
    return { ok: false, message: "حدث خطأ أثناء النشر." };
  }
  updateTag(tenantTag(ctx.slug));
  refresh();
  return { ok: true };
}

/** Throws away what's in the preview and not published: the preview shows the public site again. */
export async function discardPreviewAction(site: string): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  await repo.discardPreview(ctx.slug, principalName(ctx.p));
  updateTag(tenantTag(ctx.slug));
  refresh();
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

/* ------------------------------------------------------------------ */
/* Quizzes (/admin/quizzes)                                            */
/* ------------------------------------------------------------------ */

/** Open now / close now / back to the dates. Saved like any edit (with a revision). */
export async function setQuizStateAction(site: string, path: string, state: "auto" | "open" | "closed", env: SiteEnv = "production"): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  if (!["auto", "open", "closed"].includes(state) || !isEnv(env)) return;
  const t = await repo.getTenant(ctx.slug);
  const copy = t ? repo.copyFor(t, env).content : null;
  if (!t || !copy || !copy.quizzes.some((q) => q.path === path)) return;
  const content = { ...copy, quizzes: copy.quizzes.map((q) => (q.path === path ? { ...q, state } : q)) };
  const note = `${state === "open" ? "فتح اختبار" : state === "closed" ? "قفل اختبار" : "اختبار حسب التواريخ"}: ${path}`;
  // In the preview, opening/closing a quiz only changes the preview copy.
  const r = env === "preview"
    ? await repo.savePreview(ctx.slug, { content }, null, principalName(ctx.p), note)
    : await repo.saveTenant(ctx.slug, { content }, t.version, principalName(ctx.p), note);
  // Changed on the public site: the preview copy (if any) gets the same, like any production save.
  if (r.ok && env === "production" && t.preview.pending) {
    const p = t.preview.content;
    await repo.savePreview(ctx.slug, { content: { ...p, quizzes: p.quizzes.map((q) => (q.path === path ? { ...q, state } : q)) } }, null, principalName(ctx.p), note);
  }
  if (r.ok) updateTag(tenantTag(ctx.slug));
  refresh();
}

/** Removes attempts (e.g. so a student can take the quiz again). */
export async function deleteAttemptAction(site: string, path: string, ids: number[]): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  await quizRepo.deleteAttempts(ctx.slug, path, ids.filter(Number.isInteger));
  refresh();
}

/* ------------------------------------------------------------------ */
/* Site files (super admin): verification files etc. at the site root  */
/* ------------------------------------------------------------------ */

/** Upload files (or one pasted file: name + content) for a teacher. */
export async function putSiteFilesAction(slug: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  const p = await requireSuper(PLATFORM);
  const items: { name: string; content: string }[] = [];
  for (const f of form.getAll("files")) {
    if (f instanceof File && f.size > 0) {
      if (f.size > MAX_SITE_FILE) return { ok: false, message: `${f.name}: الملف أكبر من 64 كيلوبايت.` };
      items.push({ name: f.name, content: await f.text() });
    }
  }
  const pastedName = String(form.get("name") ?? "").trim();
  if (pastedName) items.push({ name: pastedName, content: String(form.get("content") ?? "") });
  if (!items.length) return { ok: false, message: "اختار ملف أو اكتب اسم الملف ومحتواه." };
  const lines: string[] = [];
  try {
    for (const it of items) lines.push(`/${await siteFiles.putSiteFile(slug, it.name, it.content, principalName(p))}`);
  } catch (e) {
    if (e instanceof siteFiles.SiteFileError) return { ok: false, message: e.message, lines };
    throw e;
  }
  updateTag(siteFiles.filesTag(slug));
  refresh();
  return { ok: true, message: "تم الحفظ. الملفات متاحة الآن على:", lines };
}

export async function deleteSiteFileAction(slug: string, name: string): Promise<void> {
  await requireSuper(PLATFORM);
  await siteFiles.deleteSiteFile(slug, name);
  updateTag(siteFiles.filesTag(slug));
  refresh();
}

/* ------------------------------------------------------------------ */
/* Exam results (/admin/results)                                       */
/* ------------------------------------------------------------------ */

type Done<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const failed = (e: unknown): { ok: false; message: string } => {
  if (e instanceof results.ResultsError) return { ok: false, message: e.message };
  if (e instanceof repo.ReadOnlyError) return { ok: false, message: "لا توجد قاعدة بيانات متصلة، الحفظ معطّل." };
  console.error("results", e);
  return { ok: false, message: "حصلت مشكلة، حاول تاني." };
};

/** New exam results (title/date copied from an exam on the page, or typed), then opens it. */
export async function createResultSetAction(site: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return { ok: false, message: "غير مصرح." };
  let id: number;
  try {
    id = await results.createResultSet(ctx.slug, {
      examId: String(form.get("examId") ?? "") || null,
      title: form.get("title"), date: form.get("date"), total: form.get("total"),
    }, principalName(ctx.p));
  } catch (e) { return failed(e); }
  redirect(`${baseForSite(site)}/admin/results/${id}`);
}

export async function updateResultMetaAction(site: string, id: number, meta: { title: string; date: string; total: string; published: boolean; previewPublished: boolean }): Promise<Done> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return { ok: false, message: "غير مصرح." };
  try {
    await results.updateResultMeta(ctx.slug, id, meta, principalName(ctx.p));
  } catch (e) { return failed(e); }
  // The exams section lists published exams.
  updateTag(tenantTag(ctx.slug));
  refresh();
  return { ok: true };
}

export async function importResultsAction(site: string, id: number, rows: unknown[], mode: "merge" | "replace"): Promise<Done<{ summary: import("@/lib/exam-results").MergeSummary; set: results.ResultSet }>> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return { ok: false, message: "غير مصرح." };
  if (!Array.isArray(rows) || (mode !== "merge" && mode !== "replace")) return { ok: false, message: "بيانات غير صالحة." };
  try {
    const r = await results.importRows(ctx.slug, id, rows, mode, principalName(ctx.p));
    const set = await results.getResultSet(ctx.slug, id);
    if (!set) return { ok: false, message: "الامتحان مش موجود." };
    return { ok: true, summary: r.summary, set };
  } catch (e) { return failed(e); }
}

export async function saveResultRowsAction(site: string, id: number, rows: unknown[], baseVersion: number): Promise<Done<{ set: results.ResultSet }>> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) return { ok: false, message: "غير مصرح." };
  if (!Array.isArray(rows)) return { ok: false, message: "بيانات غير صالحة." };
  try {
    const r = await results.saveRows(ctx.slug, id, rows, baseVersion, principalName(ctx.p));
    if (!r.ok) return { ok: false, message: r.reason === "conflict" ? "حد تاني عدّل النتايج دي من شوية. حدّث الصفحة وكرر تعديلك." : "الامتحان مش موجود." };
    const set = await results.getResultSet(ctx.slug, id);
    return set ? { ok: true, set } : { ok: false, message: "الامتحان مش موجود." };
  } catch (e) { return failed(e); }
}

export async function deleteResultSetAction(site: string, id: number): Promise<void> {
  const ctx = await teacherContext(site);
  if ("ok" in ctx) throw new ForbiddenError();
  await results.deleteResultSet(ctx.slug, id);
  updateTag(tenantTag(ctx.slug));
  redirect(`${baseForSite(site)}/admin/results`);
}
