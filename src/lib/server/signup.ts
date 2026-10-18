import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "@/lib/phone";
import { env } from "@/lib/env";
import { YOUTUBE_RE } from "@/lib/schema";
import { buildDemo, demoLinks } from "@/lib/demo/build";
import { hashPassword } from "./passwords";
import { SLUG_RE, USERNAME_RE, storeImage, ImageError } from "./admin-ops";
import * as repo from "./repo";
import { saveSubmission } from "./submissions";
import { saveComplaint } from "./complaints";
import { checkPhoneToken, otpEnabled, phoneUsed } from "./otp";

/**
 * The public «جرّب موقعك» form (components/signup/SignupFlow.tsx → api/signup):
 * builds a complete trial site from a few answers (lib/demo/build.ts), with the
 * teacher's own admin login, that works for TRIAL_HOURS and then stops until a
 * super admin activates it.
 */
export const TRIAL_HOURS = 24;
/**
 * Build limits. Per visitor (network address): one site per COOLDOWN_MIN minutes
 * and PER_VISITOR_DAY a day; for the whole platform: PER_HOUR and PER_DAY. Each
 * browser also gets one site (the DEVICE_COOKIE), and each number one site.
 */
const COOLDOWN_MIN = 30;
const PER_VISITOR_DAY = 2;
const PER_HOUR = 40;
const PER_DAY = 300;
export const DEVICE_COOKIE = "ostaz_trial";
const DEVICE_DAYS = 60;

/** Addresses the platform needs for itself, never a teacher's. */
const RESERVED_SLUGS = new Set(["admin", "api", "www", "app", "t", "preview", "demo", "dev", "test", "mail", "support", "help", "login", "signup", "ostaz", "portfolioio"]);

export type SignupFields = {
  slug: string; name: string; title: string; subject: string; locale: "ar-EG" | "en";
  /** Calling code chosen next to the number (lib/phone.ts). */
  country: string;
  phone: string; slogan: string; videos: string[]; color: string; scheme: "light" | "dark";
  username: string; password: string;
  /** From the phone check (api/signup/otp) when codes are on. */
  phoneToken: string;
  /** The trial terms (/terms) were accepted. */
  terms: boolean;
  /** The photo had its background removed in the browser (lib/cutout.ts). */
  photoCut: boolean;
  /** «ملاحظات أو طلبات خاصة»: for the super admin's list of trial requests. */
  notes: string;
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
    country: s("country", 4),
    phone: s("phone", 30),
    slogan: s("slogan", 90),
    videos: form.getAll("videos").map((v) => String(v).trim()).filter(Boolean).slice(0, 3),
    color: s("color", 7),
    scheme: s("scheme") === "dark" ? "dark" : "light",
    username: s("username", 32).toLowerCase(),
    password: String(form.get("password") ?? "").slice(0, 100),
    phoneToken: s("phoneToken", 200),
    terms: s("terms") === "1",
    photoCut: s("photoCut") === "1",
    notes: s("notes", 1000),
  };
}

export type SlugStatus = "free" | "invalid" | "reserved" | "taken";

export const SLUG_MESSAGES: Record<Exclude<SlugStatus, "free">, string> = {
  invalid: "حروف إنجليزية صغيرة وأرقام وشرطة، 3 حروف على الأقل، مثل mohamedali",
  reserved: "العنوان ده مش متاح، اختار عنوان تاني.",
  taken: "العنوان ده مستخدم بالفعل، جرّب عنوان تاني.",
};

/** Can this be a new site's address? Taken also covers <slug>.<ROOT_DOMAIN> pointing at another teacher. */
export async function slugStatus(slug: string): Promise<SlugStatus> {
  if (!SLUG_RE.test(slug) || slug.length < 3) return "invalid";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  if (await repo.slugTaken(slug)) return "taken";
  if (env.rootDomain && (await repo.findSlugByDomain(`${slug}.${env.rootDomain}`))) return "taken";
  return "free";
}

/** The sign-up's number as international digits (lib/phone.ts), or null. */
export const signupPhone = (f: Pick<SignupFields, "country" | "phone">) => normalizePhone(f.country, f.phone);

export async function checkFields(f: SignupFields): Promise<SignupError[]> {
  const errors: SignupError[] = [];
  const bad = (field: SignupError["field"], message: string) => errors.push({ field, message });
  const slug = await slugStatus(f.slug);
  if (slug !== "free") bad("slug", SLUG_MESSAGES[slug]);
  if (f.name.length < 2) bad("name", "اكتب اسمك");
  if (f.subject.length < 2) bad("subject", "اكتب المادة");
  const digits = signupPhone(f);
  if (!digits) bad("phone", "اكتب رقم موبايل واتساب صحيح للبلد اللي اخترتها");
  else if (await phoneUsed(digits)) bad("phone", "الرقم ده عمل موقع تجريبي قبل كده. كلمنا على واتساب ونفعّله ليك.");
  else if (otpEnabled() && !checkPhoneToken(digits, f.phoneToken)) bad("phone", "أكّد رقمك بالكود اللي وصلك الأول.");
  if (!/^#[0-9a-fA-F]{6}$/.test(f.color)) bad("color", "اختار لون");
  f.videos.forEach((v) => { if (!YOUTUBE_RE.test(v)) bad("videos", `الرابط ده مش فيديو يوتيوب: ${v.slice(0, 60)}`); });
  if (!USERNAME_RE.test(f.username)) bad("username", "حروف إنجليزية صغيرة وأرقام و . _ - من 3 لـ 32 حرف");
  else if (await repo.usernameTaken(f.username)) bad("username", "اسم المستخدم ده مستخدم، اختار اسم تاني.");
  if (f.password.length < 8) bad("password", "كلمة السر 8 حروف على الأقل");
  if (!f.terms) bad("terms", "لازم توافق على شروط التجربة");
  return errors;
}

/** A visitor key for the sign-up limit: a salted hash, never the address itself. */
export function visitorKey(ip: string): string {
  const salt = process.env.SIGNUP_SALT || env.mcpToken || env.adminPassword || "portfolioio";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

/** Why this visitor can't build a site right now, or null. */
export async function tooMany(key: string): Promise<string | null> {
  const r = await repo.recentSignups(key, COOLDOWN_MIN);
  if (r.mineRecent > 0) return "لسه عامل موقع تجريبي من شوية. استنى نص ساعة وجرّب تاني.";
  if (r.mineDay >= PER_VISITOR_DAY) return "عملت مواقع تجريبية كتير النهاردة. كلمنا وهنساعدك.";
  if (r.allHour >= PER_HOUR || r.allDay >= PER_DAY) return "في ضغط كبير دلوقتي. جرّب كمان ساعة أو كلمنا على واتساب.";
  return null;
}

/* One trial per browser: a signed cookie set when a site is built. */
const deviceSign = (payload: string) => createHmac("sha256", process.env.SIGNUP_SALT || env.mcpToken || env.adminPassword || "portfolioio").update(`device|${payload}`).digest("base64url");

export function deviceCookie(slug: string, secure: boolean): string {
  const value = `${slug}.${deviceSign(slug)}`;
  return `${DEVICE_COOKIE}=${value}; Path=/; Max-Age=${DEVICE_DAYS * 86400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The trial site this browser already made (from its cookie), if it still exists. */
export async function deviceTrial(cookieHeader: string | null): Promise<{ slug: string; endsAt: string | null } | null> {
  const raw = (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${DEVICE_COOKIE}=`))?.slice(DEVICE_COOKIE.length + 1);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  const slug = raw.slice(0, dot), sig = raw.slice(dot + 1);
  const want = Buffer.from(deviceSign(slug)), got = Buffer.from(sig);
  if (!slug || want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const t = await repo.getTenant(slug).catch(() => null);
  return t ? { slug, endsAt: t.trialEndsAt } : null;
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
    // "cutout" in the file's key tells the hero it has no background (components/Hero.tsx).
    photo = await imageFrom(f.slug, files.photo, f.photoCut ? "photo-cutout" : "photo");
    logo = await imageFrom(f.slug, files.logo, "logo");
  } catch (e) {
    if (e instanceof ImageError) return { ok: false as const, errors: [{ field: "photo" as const, message: e.message }] };
    throw e;
  }
  const { content, theme } = buildDemo({
    slug: f.slug, name: f.name, title: f.title, subject: f.subject, locale: f.locale,
    whatsapp: signupPhone(f)!, slogan: f.slogan || undefined, videos: f.videos, photo, logo,
    color: f.color, scheme: f.scheme,
  });
  const endsAt = new Date(Date.now() + TRIAL_HOURS * 3600_000);
  await repo.createTenant({
    slug: f.slug, name: f.name, content, theme, author: "تجربة مجانية",
    trialEndsAt: endsAt, signupKey: key, signupPhone: signupPhone(f)!, termsAcceptedAt: new Date(),
    login: { username: f.username, passwordHash: await hashPassword(f.password) },
  });
  const made = await repo.getTenant(f.slug);
  await repo.addTrialRequest({
    tenantId: made?.id ?? null, slug: f.slug, name: `${f.title} ${f.name}`.trim(), title: f.title, subject: f.subject,
    phone: signupPhone(f)!, locale: f.locale, username: f.username, notes: f.notes,
  }).catch((e) => console.error("trial request", e));
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
