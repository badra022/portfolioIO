import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { YOUTUBE_RE } from "@/lib/schema";
import { buildDemo, demoLinks } from "@/lib/demo/build";
import { hashPassword } from "./passwords";
import { SLUG_RE, USERNAME_RE, storeImage, ImageError } from "./admin-ops";
import * as repo from "./repo";
import { saveSubmission } from "./submissions";
import { saveComplaint } from "./complaints";

/**
 * The public «جرّب موقعك» form (components/signup/SignupFlow.tsx → api/signup):
 * builds a complete trial site from a few answers (lib/demo/build.ts), with the
 * teacher's own admin login, that works for TRIAL_HOURS and then stops until a
 * super admin activates it.
 */
export const TRIAL_HOURS = 24;
/** Per visitor and per day, and for the whole platform per day. */
const PER_VISITOR = 3;
const PER_DAY = 300;

/** Addresses the platform needs for itself, never a teacher's. */
const RESERVED_SLUGS = new Set(["admin", "api", "www", "app", "t", "preview", "demo", "dev", "test", "mail", "support", "help", "login", "signup", "ostaz", "portfolioio"]);

export type SignupFields = {
  slug: string; name: string; title: string; subject: string; locale: "ar-EG" | "en";
  phone: string; slogan: string; videos: string[]; color: string; scheme: "light" | "dark";
  username: string; password: string;
};

export type SignupError = { field: keyof SignupFields | "photo" | "logo" | "form"; message: string };

/** 01012345678, +20 101..., 00201... → 201012345678. Other countries: their international digits. */
export function whatsappDigits(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^01\d{9}$/.test(d)) d = `2${d}`;
  return /^\d{10,15}$/.test(d) ? d : null;
}

export function readFields(form: FormData): SignupFields {
  const s = (k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
  return {
    slug: s("slug", 50).toLowerCase(),
    name: s("name", 60),
    title: s("title", 12),
    subject: s("subject", 40),
    locale: s("locale") === "en" ? "en" : "ar-EG",
    phone: s("phone", 30),
    slogan: s("slogan", 90),
    videos: form.getAll("videos").map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
    color: s("color", 7),
    scheme: s("scheme") === "dark" ? "dark" : "light",
    username: s("username", 32).toLowerCase(),
    password: String(form.get("password") ?? "").slice(0, 100),
  };
}

export async function checkFields(f: SignupFields): Promise<SignupError[]> {
  const errors: SignupError[] = [];
  const bad = (field: SignupError["field"], message: string) => errors.push({ field, message });
  if (!SLUG_RE.test(f.slug) || f.slug.length < 3) bad("slug", "حروف إنجليزية صغيرة وأرقام وشرطة، 3 حروف على الأقل، مثل mohamedali");
  else if (RESERVED_SLUGS.has(f.slug) || (await repo.slugTaken(f.slug))) bad("slug", "العنوان ده محجوز، جرّب عنوان تاني.");
  if (f.name.length < 2) bad("name", "اكتب اسمك");
  if (f.subject.length < 2) bad("subject", "اكتب المادة");
  if (!whatsappDigits(f.phone)) bad("phone", "اكتب رقم واتساب صحيح، مثل 01012345678");
  if (!/^#[0-9a-fA-F]{6}$/.test(f.color)) bad("color", "اختار لون");
  f.videos.forEach((v) => { if (!YOUTUBE_RE.test(v)) bad("videos", `الرابط ده مش فيديو يوتيوب: ${v.slice(0, 60)}`); });
  if (!USERNAME_RE.test(f.username)) bad("username", "حروف إنجليزية صغيرة وأرقام و . _ - من 3 لـ 32 حرف");
  else if (await repo.usernameTaken(f.username)) bad("username", "اسم المستخدم ده مستخدم، اختار اسم تاني.");
  if (f.password.length < 8) bad("password", "كلمة السر 8 حروف على الأقل");
  return errors;
}

/** A visitor key for the sign-up limit: a salted hash, never the address itself. */
export function visitorKey(ip: string): string {
  const salt = process.env.SIGNUP_SALT || env.mcpToken || env.adminPassword || "portfolioio";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

export async function tooMany(key: string): Promise<boolean> {
  const r = await repo.recentSignups(key, new Date(Date.now() - 24 * 3600_000));
  return r.mine >= PER_VISITOR || r.all >= PER_DAY;
}

async function imageFrom(slug: string, file: FormDataEntryValue | null, label: string): Promise<string | undefined> {
  if (!file || typeof file === "string" || file.size === 0) return undefined;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return (await storeImage(slug, bytes, file.type || undefined, label)).key;
}

/** Where a teacher's site lives: <slug>.<ROOT_DOMAIN>, else /t/<slug> on this host. */
export function siteBase(slug: string, origin: string): string {
  return env.rootDomain ? `https://${slug}.${env.rootDomain}` : `${origin}/t/${slug}`;
}

export async function createTrial(f: SignupFields, files: { photo: FormDataEntryValue | null; logo: FormDataEntryValue | null }, key: string, origin: string) {
  let photo: string | undefined, logo: string | undefined;
  try {
    photo = await imageFrom(f.slug, files.photo, "photo");
    logo = await imageFrom(f.slug, files.logo, "logo");
  } catch (e) {
    if (e instanceof ImageError) return { ok: false as const, errors: [{ field: "photo" as const, message: e.message }] };
    throw e;
  }
  const { content, theme } = buildDemo({
    slug: f.slug, name: f.name, title: f.title, subject: f.subject, locale: f.locale,
    whatsapp: whatsappDigits(f.phone)!, slogan: f.slogan || undefined, videos: f.videos, photo, logo,
    color: f.color, scheme: f.scheme,
  });
  const endsAt = new Date(Date.now() + TRIAL_HOURS * 3600_000);
  await repo.createTenant({
    slug: f.slug, name: f.name, content, theme, author: "تجربة مجانية",
    trialEndsAt: endsAt, signupKey: key,
    login: { username: f.username, passwordHash: await hashPassword(f.password) },
  });
  await seedSamples(f.slug, f.locale).catch((e) => console.error("trial samples", e));
  const base = siteBase(f.slug, origin);
  return { ok: true as const, base, endsAt: endsAt.toISOString(), username: f.username, links: demoLinks(base, f.locale) };
}

/** A few sample requests and a complaint, so the admin panel isn't empty on day one. */
async function seedSamples(slug: string, locale: "ar-EG" | "en") {
  const t = await repo.getTenant(slug);
  if (!t?.id) return;
  const en = locale === "en";
  const people = en
    ? [["Youssef Ahmed (sample)", "01011112222", "Grade 12"], ["Mariam Hassan (sample)", "01033334444", "Grade 11"]]
    : [["يوسف أحمد (تجريبي)", "01011112222", "تالتة ثانوي"], ["مريم حسن (تجريبي)", "01033334444", "تانية ثانوي"]];
  for (const [name, phone, grade] of people) {
    await saveSubmission(t.id, { formId: "booking", source: "hero", place: "hero", fields: { name, phone, grade }, context: {}, env: "production" });
  }
  await saveComplaint(t.id, "production", { topic: en ? "Schedule" : "المواعيد", message: en ? "This is a sample anonymous complaint: the Saturday group starts late." : "دي شكوى تجريبية من غير اسم: مجموعة السبت بتبدأ متأخر." });
}
