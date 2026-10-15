import type { Content } from "./schema";

/**
 * What a teacher's plan includes, set by the super admin per teacher (console →
 * teacher page). Five bundles plus a limit on forms. A bundle that's off:
 * - can't be saved to the public site (saving to the preview still works),
 * - is left out of the public site right away (lib/server/site.ts),
 * - and its data pages in the admin show an error (analytics, requests).
 * It applies to everyone editing that teacher's site, the super admin included.
 */
export const FEATURES = ["analytics", "students", "forms", "exams", "votes", "promo"] as const;
export type Feature = (typeof FEATURES)[number];

export type Permissions = Record<Feature, boolean> & {
  /** Most data-collection forms on the site's buttons (forms used only by quizzes don't count). null = no limit. */
  maxForms: number | null;
};

/** New teachers: nothing paid. */
export const NO_PERMISSIONS: Permissions = { analytics: false, students: false, forms: false, exams: false, votes: false, promo: false, maxForms: null };
/** Teachers from before permissions existed, and sites without a database. */
export const ALL_PERMISSIONS: Permissions = { analytics: true, students: true, forms: true, exams: true, votes: true, promo: true, maxForms: null };

export const FEATURE_INFO: Record<Feature, { title: string; description: string }> = {
  analytics: { title: "الإحصائيات", description: "صفحة الإحصائيات وأرقام الزيارات والضغطات في لوحة المدرس." },
  students: { title: "ملفات الطلاب", description: "ملف لكل طالب برقم موبايله: بياناته، طلباته، اختباراته ونتايجه، ومنحنى مستواه، وتنزيلهم Excel. البيانات بتتجمع حتى لو مقفولة." },
  forms: { title: "النماذج والطلبات", description: "نماذج جمع بيانات الطلاب على الأزرار، وصفحة «الطلبات» وتنزيلها." },
  exams: { title: "الاختبارات والنتايج", description: "الاختبارات الأونلاين وتصحيحها، ونتايج الامتحانات اللي الطلاب بيدوروا فيها." },
  votes: { title: "التصويتات", description: "صفحات التصويت من غير اسم ولا رقم." },
  promo: { title: "أدوات الإعلان", description: "الإعلان المنبثق، الشريط الأحمر، القسم المميز (العروض)، وروابط الشركاء (التسويق بالعمولة)." },
};

/** Stored permissions (tenants.permissions) as a full object: anything missing is off. */
export function readPermissions(raw: unknown): Permissions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const max = typeof o.maxForms === "number" && Number.isInteger(o.maxForms) && o.maxForms >= 0 ? o.maxForms : null;
  return { ...Object.fromEntries(FEATURES.map((f) => [f, o[f] === true])) as Record<Feature, boolean>, maxForms: max };
}

export const blockedMessage = (f: Feature) => `«${FEATURE_INFO[f].title}» مش متاحة في باقة الموقع ده. كلم الإدارة لتفعيلها.`;

/* ------------------------------------------------------------------ */
/* What the content uses                                               */
/* ------------------------------------------------------------------ */

/** Form ids used by buttons anywhere on the site (everything but the forms list and the quizzes). */
function buttonFormRefs(c: Content): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, top: boolean) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, false));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (top && (k === "forms" || k === "quizzes")) continue;
        if (k === "form" && typeof x === "string" && x) out.add(x);
        else walk(x, false);
      }
    }
  };
  walk(c, true);
  return out;
}

/** The forms that count toward the forms bundle: all but those only a quiz uses. */
export function countedForms(c: Content): Content["forms"] {
  const quizOnly = new Set(c.quizzes.map((q) => q.form).filter((f): f is string => Boolean(f)));
  const buttons = buttonFormRefs(c);
  return c.forms.filter((f) => !quizOnly.has(f.id) || buttons.has(f.id));
}

/** Per bundle: whether the content uses it, and a fingerprint of that part (to tell if a save changes it). */
function usage(c: Content): Record<Exclude<Feature, "analytics" | "students">, { used: boolean; print: string }> {
  const featuredOn = c.sections.includes("featured") && (c.featured?.items.length ?? 0) > 0;
  const promoUsed = Boolean(c.popup?.enabled) || (c.bar?.items.length ?? 0) > 0 || featuredOn || c.referrals.length > 0;
  return {
    forms: { used: countedForms(c).length > 0, print: JSON.stringify([c.forms, [...buttonFormRefs(c)].sort()]) },
    exams: { used: c.quizzes.length > 0, print: JSON.stringify(c.quizzes) },
    votes: { used: c.polls.length > 0, print: JSON.stringify(c.polls) },
    promo: { used: promoUsed, print: JSON.stringify([c.popup ?? null, c.bar ?? null, c.featured ?? null, featuredOn, c.referrals]) },
  };
}

/**
 * Why a save to the public site isn't allowed (empty = fine). Only parts the save
 * changes are checked, so a teacher whose plan shrank can still edit the rest.
 */
export function violations(next: Content, prev: Content | null, p: Permissions): { path: string; message: string }[] {
  const now = usage(next);
  const before = prev ? usage(prev) : null;
  const out: { path: string; message: string }[] = [];
  for (const f of ["forms", "exams", "votes", "promo"] as const) {
    if (!now[f].used || (before && before[f].print === now[f].print)) continue;
    if (!p[f]) out.push({ path: f === "exams" ? "quizzes" : f === "votes" ? "polls" : f === "promo" ? "popup" : "forms", message: blockedMessage(f) });
    else if (f === "forms" && p.maxForms !== null && countedForms(next).length > p.maxForms) {
      out.push({ path: "forms", message: `باقة الموقع فيها ${p.maxForms} نماذج بس، والمحفوظ فيه ${countedForms(next).length}. احذف نموذج أو كلم الإدارة.` });
    }
  }
  return out;
}

/**
 * The content the public site shows under a plan: bundles that are off are left
 * out right away (buttons that opened a removed form go back to WhatsApp).
 */
export function applyPermissions(c: Content, p: Permissions): Content {
  let out = c;
  if (!p.exams) out = { ...out, quizzes: [] };
  if (!p.votes) out = { ...out, polls: [] };
  if (!p.promo) out = { ...out, popup: undefined, bar: undefined, referrals: [], sections: out.sections.filter((s) => s !== "featured") };
  const counted = countedForms(out);
  const keep = !p.forms ? [] : p.maxForms === null ? counted : counted.slice(0, p.maxForms);
  if (keep.length < counted.length) {
    const allowed = new Set(keep.map((f) => f.id));
    const quizForms = new Set(out.quizzes.map((q) => q.form).filter(Boolean));
    const strip = (v: unknown, top: boolean): unknown => {
      if (Array.isArray(v)) return v.map((x) => strip(x, false));
      if (!v || typeof v !== "object") return v;
      return Object.fromEntries(Object.entries(v).flatMap(([k, x]) => {
        if (top && (k === "forms" || k === "quizzes")) return [[k, x]];
        if (k === "form" && typeof x === "string" && !allowed.has(x)) return [];
        return [[k, strip(x, false)]];
      }));
    };
    out = strip(out, true) as Content;
    out = { ...out, forms: out.forms.filter((f) => allowed.has(f.id) || quizForms.has(f.id)) };
  }
  return out;
}
