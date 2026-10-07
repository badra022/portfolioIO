import { z } from "zod";
import { ContentSchema, ThemeSchema, type Content } from "./schema";
import { deadline, endOfDay, instantOf, isOver } from "./dates";

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

/**
 * Drops what has expired: exams whose day is over (Cairo time), the exam red line
 * after its end date, and the pop-up when it's switched off or past its end date.
 * Runs whenever the page is (re)rendered; cached pages refresh at least hourly, and
 * the red line and pop-up also check their end date in the visitor's browser.
 */
export function withLiveContent(content: Content, now: Date): Content {
  let c = content;
  if (c.exams) {
    const items = c.exams.items.filter((e) => !isOver(endOfDay(e.date), now));
    const barOver = c.exams.announcementEnds ? isOver(deadline(c.exams.announcementEnds), now) : false;
    const bar = startState(c.exams.announcementStarts, now);
    c = {
      ...c,
      exams: {
        ...c.exams, items,
        announcement: barOver || bar === "later" ? undefined : c.exams.announcement,
        announcementStarts: bar === "soon" ? c.exams.announcementStarts : undefined,
      },
    };
  }
  if (c.popup) {
    const start = startState(c.popup.startsAt, now);
    if (!c.popup.enabled || start === "later" || (c.popup.endsAt && isOver(deadline(c.popup.endsAt), now))) c = { ...c, popup: undefined };
    else c = { ...c, popup: { ...c.popup, startsAt: start === "soon" ? c.popup.startsAt : undefined } };
  }
  return c;
}

/**
 * A start date relative to a render: "started" (show it; the date is dropped), "soon"
 * (within the cache lifetime: kept so the browser reveals it on time) or "later"
 * (left out; a later render picks it up).
 */
const CACHE_WINDOW = 2 * 60 * 60_000;
function startState(starts: string | undefined, now: Date): "started" | "soon" | "later" {
  if (!starts) return "started";
  const at = instantOf(starts).getTime();
  if (at <= now.getTime()) return "started";
  return at - now.getTime() <= CACHE_WINDOW ? "soon" : "later";
}

export type Issue = { path: string; message: string };

/** Validates with Arabic error messages; returns flat issues keyed by dotted path. */
export function validate<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; issues: Issue[] } {
  const r = schema.safeParse(value, { error: z.locales.ar().localeError });
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
}
