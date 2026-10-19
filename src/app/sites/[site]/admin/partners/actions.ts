"use server";

import { redirect } from "next/navigation";
import { refresh, updateTag } from "next/cache";
import { requireSuper } from "@/lib/server/auth";
import * as repo from "@/lib/server/repo";
import { tenantTag } from "@/lib/server/site";
import { generatePassword } from "@/lib/server/passwords";
import { USERNAME_RE } from "@/lib/server/admin-ops";
import { TRIAL_HOURS_MAX, createPartner, deletePartner, getPartner, getPartnerById, partnerUsernameTaken, setTenantPartner, updatePartner } from "@/lib/server/partners";
import { PARTNER_SLUG_RE, PartnerFormSchema, RESERVED_PARTNER_SLUGS, type PartnerForm } from "@/lib/partners";
import type { ConsoleState } from "../actions";

/* Partners (agencies) and their private sign-up pages: super admin only, on the platform host. */
const PLATFORM = "_platform";

const text = (form: FormData, k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);

async function checkBasics(form: FormData, exceptId?: string): Promise<{ ok: false; message: string } | { ok: true; slug: string; name: string; username: string; trialHours: number; notes: string }> {
  const slug = text(form, "slug", 40).toLowerCase();
  const name = text(form, "name", 80);
  const username = text(form, "username", 32).toLowerCase();
  const trialHours = Math.round(Number(text(form, "trialHours", 6)) || 0);
  if (!name) return { ok: false, message: "اكتب اسم الشريك." };
  if (!PARTNER_SLUG_RE.test(slug)) return { ok: false, message: "عنوان الصفحة: 3-40 حرف إنجليزي صغير أو أرقام أو شرطة، مثل teacheron." };
  if (RESERVED_PARTNER_SLUGS.has(slug)) return { ok: false, message: "عنوان الصفحة ده محجوز للمنصة، اختار غيره." };
  const other = await getPartner(slug);
  if (other && other.id !== exceptId) return { ok: false, message: "عنوان الصفحة ده لشريك تاني." };
  if (!USERNAME_RE.test(username)) return { ok: false, message: "اسم المستخدم: 3-32 حرف إنجليزي صغير أو أرقام أو . _ -" };
  const current = exceptId ? await getPartnerById(exceptId) : null;
  if (username !== current?.username && (await partnerUsernameTaken(username, exceptId) || await repo.usernameTaken(username))) return { ok: false, message: "اسم المستخدم ده مستخدم (لمدرس أو شريك)." };
  if (trialHours < 1 || trialHours > TRIAL_HOURS_MAX) return { ok: false, message: `مدة التجربة: من 1 لـ ${TRIAL_HOURS_MAX} ساعة.` };
  return { ok: true, slug, name, username, trialHours, notes: text(form, "notes", 2000) };
}

export async function createPartnerAction(_prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const b = await checkBasics(form);
  if (!b.ok) return b;
  const typed = String(form.get("password") ?? "");
  if (typed && typed.length < 8) return { ok: false, message: "كلمة السر 8 حروف على الأقل (أو سيبها فاضية ونعملها إحنا)." };
  const password = typed || generatePassword();
  try {
    await createPartner({ ...b, password });
  } catch (e) {
    console.error(e);
    return { ok: false, message: "تعذّر إضافة الشريك." };
  }
  refresh();
  return { ok: true, message: "الشريك اتضاف. ابعتله الرابط والحساب (كلمة السر مش هتظهر تاني).", secret: { username: b.username, password, loginUrl: `/${b.slug}` } };
}

export async function updatePartnerAction(id: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const b = await checkBasics(form, id);
  if (!b.ok) return b;
  const before = await getPartnerById(id);
  await updatePartner(id, { ...b, disabled: form.get("disabled") === "on" });
  refresh();
  if (before && before.slug !== b.slug) redirect(`/admin/partners/${b.slug}`);
  return { ok: true, message: "اتحفظ." };
}

/** A new password: the one typed, or a generated one. Shown once. */
export async function partnerPasswordAction(id: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const p = await getPartnerById(id);
  if (!p) return { ok: false, message: "الشريك مش موجود." };
  const typed = String(form.get("password") ?? "");
  if (typed && typed.length < 8) return { ok: false, message: "كلمة السر 8 حروف على الأقل." };
  const password = typed || generatePassword();
  await updatePartner(id, { password });
  return { ok: true, message: "كلمة السر اتغيرت. ابعتها للشريك (مش هتظهر تاني).", secret: { username: p.username, password, loginUrl: `/${p.slug}` } };
}

/** The partner page's own settings: intro, default color, extra questions (components/admin/PartnerFormEditor.tsx). */
export async function savePartnerFormAction(id: string, value: PartnerForm): Promise<{ ok: boolean; message: string }> {
  await requireSuper(PLATFORM);
  const r = PartnerFormSchema.safeParse(value);
  if (!r.success) return { ok: false, message: "في حقل ناقص: كل سؤال محتاج عنوان، وكل قائمة محتاجة اختيارات." };
  const ids = r.data.fields.map((f) => f.id);
  if (new Set(ids).size !== ids.length) return { ok: false, message: "في سؤالين بنفس المعرّف." };
  if (r.data.fields.some((f) => f.type === "select" && f.options.length < 2)) return { ok: false, message: "أسئلة القوائم محتاجة اختيارين على الأقل." };
  await updatePartner(id, { form: r.data });
  refresh();
  return { ok: true, message: "اتحفظ. الصفحة بتظهر بالشكل الجديد على طول." };
}

export async function deletePartnerAction(id: string): Promise<void> {
  await requireSuper(PLATFORM);
  await deletePartner(id);
  redirect("/admin/partners");
}

/** Which partner a teacher belongs to (manages the site with its login); empty = none. */
export async function setTenantPartnerAction(slug: string, _prev: ConsoleState, form: FormData): Promise<ConsoleState> {
  await requireSuper(PLATFORM);
  const id = String(form.get("partner") ?? "");
  if (id && !(await getPartnerById(id))) return { ok: false, message: "اختار شريك من القائمة." };
  await setTenantPartner(slug, id || null);
  updateTag(tenantTag(slug));
  refresh();
  return { ok: true, message: id ? "اتحفظ: الموقع تبع الشريك، وحسابه يقدر يدخل لوحة التحكم." : "اتحفظ: الموقع من غير شريك." };
}
