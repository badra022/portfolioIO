import { z } from "zod";
import { ContentSchema, ThemeSchema, type Content } from "./schema";

type JsonSchema = Record<string, unknown> & { properties?: Record<string, JsonSchema>; items?: JsonSchema; anyOf?: JsonSchema[] };

/** JSON Schemas the admin forms are generated from (input shape: fields with defaults are optional). */
export const contentJsonSchema = z.toJSONSchema(ContentSchema, { io: "input", unrepresentable: "any" }) as JsonSchema;
export const themeJsonSchema = z.toJSONSchema(ThemeSchema, { io: "input", unrepresentable: "any" }) as JsonSchema;

/** Marks "every item of this list" in an image path. */
const EACH = "[]";

/**
 * Paths of every image field (marked with meta({ widget: "image" }) in schema.ts),
 * e.g. ["profile","photo"] or ["students","gallery","[]","image"] for images inside lists.
 */
export const IMAGE_PATHS: string[][] = (() => {
  const out: string[][] = [];
  const walk = (s: JsonSchema | undefined, path: string[]) => {
    if (!s) return;
    if (s.widget === "image") { out.push(path); return; }
    for (const branch of s.anyOf ?? []) walk(branch, path);
    for (const [k, v] of Object.entries(s.properties ?? {})) walk(v, [...path, k]);
    if (s.items) walk(s.items, [...path, EACH]);
  };
  walk(contentJsonSchema, []);
  return out;
})();

function mapAt(node: unknown, path: string[], fn: (value: string) => string): void {
  if (node === null || typeof node !== "object") return;
  const [key, ...rest] = path;
  if (key === EACH) {
    if (Array.isArray(node)) for (const item of node) mapAt(item, rest, fn);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (rest.length === 0) {
    if (typeof obj[key] === "string" && obj[key]) obj[key] = fn(obj[key] as string);
    return;
  }
  mapAt(obj[key], rest, fn);
}

/** Returns a copy of content with every image field passed through fn. */
export function mapImages(content: Content, fn: (value: string) => string): Content {
  const copy = structuredClone(content);
  for (const path of IMAGE_PATHS) mapAt(copy, path, fn);
  return copy;
}

const parseDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso));

/** Drops exams whose day is over. Runs when the page is (re)rendered, so cached pages refresh at least hourly. */
export function withUpcomingExams(content: Content, now: Date): Content {
  if (!content.exams) return content;
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  return { ...content, exams: { ...content.exams, items: content.exams.items.filter((e) => parseDate(e.date) >= startOfToday) } };
}

export type Issue = { path: string; message: string };

/** Validates with Arabic error messages; returns flat issues keyed by dotted path. */
export function validate<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; issues: Issue[] } {
  const r = schema.safeParse(value, { error: z.locales.ar().localeError });
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
}
