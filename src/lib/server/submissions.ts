import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { hasDb } from "@/lib/env";
import type { LeadFormT } from "@/lib/schema";
import { PLACE } from "@/lib/admin/places";

const { submissions, tenants } = schema;

export const STATUSES = ["new", "contacted", "done"] as const;
export type StatusT = (typeof STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Receiving                                                           */
/* ------------------------------------------------------------------ */

export type Incoming = { form: string; source: string; place: string; values: Record<string, string>; context: Record<string, string> };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Digits only with an optional leading +; Egyptian local numbers (01...) are kept as typed. */
export const normalizePhone = (v: string) => v.replace(/[\s\-().]/g, "").replace(/^00/, "+");

/** Reads a request body into a submission; unknown keys and oversize values are dropped. */
export function parseIncoming(body: unknown): Incoming | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const form = str(b.form, 40);
  if (!form) return null;
  const obj = (v: unknown, maxKeys: number, maxLen: number) => Object.fromEntries(
    Object.entries(v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {})
      .slice(0, maxKeys)
      .map(([k, x]) => [k.slice(0, 40), typeof x === "number" ? String(x) : str(x, maxLen)])
      .filter(([, x]) => x !== ""),
  );
  return { form, source: str(b.source, 160), place: str(b.place, 40), values: obj(b.values, 20, 1000), context: obj(b.context, 12, 400) };
}

/** Checks the answers against the teacher's form. Returns cleaned values, or Arabic errors by field id. */
export function checkAnswers(form: LeadFormT, values: Record<string, string>): { ok: true; fields: Record<string, string> } | { ok: false; errors: Record<string, string> } {
  const fields: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of form.fields) {
    let v = (values[f.id] ?? "").trim();
    if (!v) { if (f.required) errors[f.id] = "مطلوب"; continue; }
    if (f.type === "tel") {
      v = normalizePhone(v);
      if (!/^\+?\d{8,15}$/.test(v)) { errors[f.id] = "اكتب رقم صحيح"; continue; }
    } else if (f.type === "number") {
      if (!/^-?\d+([.,]\d+)?$/.test(v)) { errors[f.id] = "اكتب رقم"; continue; }
    } else if (f.type === "select") {
      if (!f.options.includes(v)) { errors[f.id] = "اختر من القائمة"; continue; }
    } else if (f.type !== "textarea") {
      v = v.slice(0, 200);
    }
    fields[f.id] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, fields };
}

/**
 * Stores a submission. The same student sending the same thing again within ten
 * minutes (double tap, retry) is stored once.
 */
export async function saveSubmission(tenantId: string, s: { formId: string; source: string; place: string; fields: Record<string, string>; context: Record<string, string> }): Promise<void> {
  const d = db();
  const recent = await d.select({ fields: submissions.fields, context: submissions.context, source: submissions.source })
    .from(submissions)
    .where(and(eq(submissions.tenantId, tenantId), eq(submissions.formId, s.formId), gte(submissions.createdAt, new Date(Date.now() - 10 * 60_000))))
    .limit(50);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (recent.some((r) => r.source === s.source && same(r.fields, s.fields) && same(r.context, s.context))) return;
  await d.insert(submissions).values({ tenantId, ...s });
}

/* ------------------------------------------------------------------ */
/* Reading (admin)                                                     */
/* ------------------------------------------------------------------ */

export type SubmissionRow = {
  id: number; formId: string; source: string; place: string;
  fields: Record<string, string>; context: Record<string, string>;
  status: StatusT; createdAt: string;
};

export type Filter = { form?: string; status?: StatusT; q?: string; limit?: number; offset?: number };

async function tenantIdOf(slug: string): Promise<string | null> {
  return (await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0]?.id ?? null;
}

function where(tenantId: string, f: Filter) {
  return and(
    eq(submissions.tenantId, tenantId),
    f.form ? eq(submissions.formId, f.form) : undefined,
    f.status ? eq(submissions.status, f.status) : undefined,
    // Search phone/name/answers: the JSON text of fields and context.
    f.q ? sql`(${submissions.fields}::text || ${submissions.context}::text || ${submissions.source}) ilike ${`%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}` : undefined,
  );
}

export async function listSubmissions(slug: string, f: Filter = {}): Promise<{ rows: SubmissionRow[]; total: number; counts: Record<StatusT, number> }> {
  const empty = { rows: [], total: 0, counts: { new: 0, contacted: 0, done: 0 } };
  if (!hasDb()) return empty;
  const id = await tenantIdOf(slug);
  if (!id) return empty;
  const d = db();
  const [rows, total, byStatus] = await Promise.all([
    d.select().from(submissions).where(where(id, f)).orderBy(desc(submissions.createdAt), desc(submissions.id)).limit(f.limit ?? 50).offset(f.offset ?? 0),
    d.select({ n: sql<number>`count(*)::int` }).from(submissions).where(where(id, f)),
    d.select({ status: submissions.status, n: sql<number>`count(*)::int` }).from(submissions).where(where(id, { ...f, status: undefined })).groupBy(submissions.status),
  ]);
  const counts = { new: 0, contacted: 0, done: 0 } as Record<StatusT, number>;
  for (const r of byStatus) counts[r.status as StatusT] = r.n;
  return {
    rows: rows.map((r) => ({
      id: r.id, formId: r.formId, source: r.source, place: r.place,
      fields: r.fields as Record<string, string>, context: r.context as Record<string, string>,
      status: r.status as StatusT, createdAt: r.createdAt.toISOString(),
    })),
    total: total[0]?.n ?? 0,
    counts,
  };
}

/** New (unhandled) submissions, for the badge on the admin home. */
export async function countNew(slug: string): Promise<number> {
  if (!hasDb()) return 0;
  const id = await tenantIdOf(slug);
  if (!id) return 0;
  return (await db().select({ n: sql<number>`count(*)::int` }).from(submissions).where(and(eq(submissions.tenantId, id), eq(submissions.status, "new"))))[0]?.n ?? 0;
}

export async function setStatus(slug: string, ids: number[], status: StatusT): Promise<void> {
  const id = await tenantIdOf(slug);
  if (!id || !ids.length) return;
  await db().update(submissions).set({ status }).where(and(eq(submissions.tenantId, id), inArray(submissions.id, ids)));
}

export async function deleteSubmissions(slug: string, ids: number[]): Promise<void> {
  const id = await tenantIdOf(slug);
  if (!id || !ids.length) return;
  await db().delete(submissions).where(and(eq(submissions.tenantId, id), inArray(submissions.id, ids)));
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

const STATUS_AR: Record<StatusT, string> = { new: "جديد", contacted: "تم التواصل", done: "منتهي" };

/**
 * CSV that opens correctly in Excel and Google Sheets: UTF-8 with a BOM (so Arabic
 * shows), one column per form question (by its label) and per attached detail.
 * Cells that start like a formula are prefixed so Excel never runs them.
 */
export function toCsv(rows: SubmissionRow[], forms: LeadFormT[]): string {
  const label = new Map<string, string>();
  const phone = new Set<string>();
  for (const f of forms) for (const x of f.fields) {
    if (!label.has(x.id)) label.set(x.id, x.label);
    if (x.type === "tel") phone.add(x.id);
  }
  const fieldIds = [...new Set(rows.flatMap((r) => Object.keys(r.fields)))];
  const ctxKeys = [...new Set(rows.flatMap((r) => Object.keys(r.context)))];
  const formTitle = new Map(forms.map((f) => [f.id, f.title]));
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) && !/^\+?\d[\d\s]*$/.test(v) ? `'${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(",", "");
  const head = ["التاريخ", "النموذج", "الزر", "مكان الزر", "الحالة", ...fieldIds.map((k) => label.get(k) ?? k), ...ctxKeys];
  const lines = rows.map((r) => [
    when(r.createdAt), formTitle.get(r.formId) ?? r.formId, r.source, PLACE[r.place] ?? r.place, STATUS_AR[r.status],
    ...fieldIds.map((k) => r.fields[k] ?? ""), ...ctxKeys.map((k) => r.context[k] ?? ""),
  ].map((v, i) => {
    const id = fieldIds[i - 5];
    // Excel would turn 01012345678 into a number and drop the 0; ="..." keeps it as text (validated digits only).
    return id && phone.has(id) && /^\+?\d{8,15}$/.test(v) ? `"=""${v}"""` : cell(v);
  }).join(","));
  return "﻿" + [head.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
