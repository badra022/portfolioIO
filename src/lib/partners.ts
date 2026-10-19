import { z } from "zod";

/**
 * A partner's sign-up page settings (partners.form, edited in admin/partners):
 * its own intro text and the extra questions it asks on top of the usual form.
 * Shared by the page (components/signup/SignupFlow.tsx) and the server.
 */
export const FIELD_TYPES = ["text", "textarea", "select", "number", "date"] as const;
export const FIELD_TYPE_LABEL: Record<(typeof FIELD_TYPES)[number], string> = {
  text: "نص قصير", textarea: "نص طويل", select: "اختيار من قائمة", number: "رقم", date: "تاريخ",
};

const FieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(FIELD_TYPES).catch("text"),
  /** For select: the choices. */
  options: z.array(z.string().trim().min(1).max(80)).max(30).catch([]),
  required: z.boolean().catch(false),
  placeholder: z.string().trim().max(120).catch(""),
});

export const PartnerFormSchema = z.object({
  /** Shown on top of the partner's page. */
  intro: z.string().trim().max(600).catch(""),
  fields: z.array(FieldSchema).max(20).catch([]),
  /** The color the form starts with (the partner can still pick another). */
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).or(z.literal("")).catch(""),
  /** Hide the YouTube videos question. */
  hideVideos: z.boolean().catch(false),
});

export type PartnerField = z.infer<typeof FieldSchema>;
export type PartnerForm = z.infer<typeof PartnerFormSchema>;

export function readPartnerForm(v: unknown): PartnerForm {
  const r = PartnerFormSchema.safeParse(v ?? {});
  if (r.success) return r.data;
  // Keep what is valid: fields one by one.
  const raw = (v ?? {}) as { fields?: unknown[] };
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).flatMap((f) => { const x = FieldSchema.safeParse(f); return x.success ? [x.data] : []; });
  return { ...PartnerFormSchema.parse({}), fields };
}

/** The partner page's address: myostaz.com/<slug>. */
export const PARTNER_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Paths the platform host uses for itself, never a partner's page. */
export const RESERVED_PARTNER_SLUGS = new Set([
  "admin", "api", "terms", "t", "upload", "files", "preview", "brand", "demo", "segment", "local-assets", "sites",
  "robots.txt", "sitemap.xml", "og.png", "favicon.ico", "icon", "apple-icon", "www", "app", "login", "signup", "help", "support",
  "partner", "partners", "ostaz", "myostaz", "portfolioio",
]);

/** Answers to a partner's extra fields, checked against its form. Returns the answers by label, or the first error. */
export function checkExtra(form: PartnerForm, answers: Record<string, string>): { ok: true; extra: Record<string, string> } | { ok: false; field: string; message: string } {
  const extra: Record<string, string> = {};
  for (const f of form.fields) {
    const v = (answers[f.id] ?? "").trim().slice(0, f.type === "textarea" ? 2000 : 200);
    if (!v) {
      if (f.required) return { ok: false, field: `x:${f.id}`, message: `اكتب «${f.label}»` };
      continue;
    }
    if (f.type === "select" && f.options.length && !f.options.includes(v)) return { ok: false, field: `x:${f.id}`, message: `اختار «${f.label}» من القائمة` };
    if (f.type === "number" && !/^-?\d+(\.\d+)?$/.test(v)) return { ok: false, field: `x:${f.id}`, message: `«${f.label}» لازم يكون رقم` };
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, field: `x:${f.id}`, message: `«${f.label}» لازم يكون تاريخ` };
    extra[f.label] = v;
  }
  return { ok: true, extra };
}
