import "server-only";
import { contentJsonSchema, themeJsonSchema } from "@/lib/content-utils";
import { hintFor, labelFor } from "@/lib/admin/labels";

/**
 * Path edits on a teacher's content, applied to a copy; the caller validates and saves
 * the result as one revision. A path is dotted, and a list item is picked by position
 * or by one of its own fields:
 *
 *   hero.headline.0              position
 *   schedule.slots[id=S3A].time  the slot whose id is S3A (also [path=…], [title=…]…)
 *   bar.items[0]                 same as bar.items.0
 *   schedule.slots.-             the end of the list (set appends)
 *
 * Picking by a field keeps an edit on the right item when the order changed meanwhile.
 */
export type Op =
  | { op: "set"; path: string; value?: unknown }
  | { op: "merge"; path: string; value?: unknown }
  | { op: "append"; path: string; value?: unknown }
  | { op: "insert"; path: string; value?: unknown }
  | { op: "upsert"; path: string; value?: unknown; by?: string }
  | { op: "remove"; path: string };

/** One step of a path: a key or position, or a list item picked by a field's value. */
type Seg = string | { key: string; value: string };

export class PathError extends Error {}

const isIndex = (p: string) => /^\d+$/.test(p);
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
/** Fields that name a list item, in the order tried by upsert and shown in summaries. */
export const ID_KEYS = ["id", "path", "code", "key"] as const;

export function parsePath(path: string): Seg[] {
  const out: Seg[] = [];
  let buf = "";
  const flush = () => { const b = buf.trim(); if (b) out.push(b); buf = ""; };
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === ".") flush();
    else if (ch === "[") {
      flush();
      const end = path.indexOf("]", i);
      if (end < 0) throw new PathError(`"${path}": missing "]".`);
      const inner = path.slice(i + 1, end).trim();
      const eq = inner.indexOf("=");
      if (eq < 0) out.push(inner);
      else out.push({ key: inner.slice(0, eq).trim(), value: inner.slice(eq + 1).trim().replace(/^(["'])(.*)\1$/, "$2") });
      i = end;
    } else buf += ch;
  }
  flush();
  for (const s of out) if (FORBIDDEN.has(typeof s === "string" ? s : s.key)) throw new PathError(`Invalid path segment in "${path}".`);
  return out;
}

const show = (segs: Seg[]) => segs.map((s, i) => (typeof s === "string" ? (i ? `.${s}` : s) : `[${s.key}=${s.value}]`)).join("");

/** Turns a step into a real key of `container` (a position for a picked list item). */
function resolve(container: unknown, seg: Seg, at: Seg[]): string {
  if (typeof seg === "string") return seg;
  if (!Array.isArray(container)) throw new PathError(`"${show(at)}" is not a list, so [${seg.key}=${seg.value}] can't pick an item.`);
  const hits = container.map((x, i) => (x && typeof x === "object" && String((x as Record<string, unknown>)[seg.key]) === seg.value ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 1) return String(hits[0]);
  if (hits.length > 1) throw new PathError(`"${show(at)}" has ${hits.length} items with ${seg.key}=${seg.value}; use the position instead.`);
  const known = container.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>)[seg.key] : undefined)).filter((v) => v !== undefined).slice(0, 30);
  throw new PathError(`"${show(at)}" has no item with ${seg.key}=${seg.value}.${known.length ? ` It has: ${known.join(", ")}.` : ""}`);
}

function walk(root: Record<string, unknown>, parts: Seg[], create: boolean): { parent: unknown; last: string } {
  let node: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node === null || typeof node !== "object") throw new PathError(`"${show(parts.slice(0, i))}" is not an object or list.`);
    const p = resolve(node, parts[i], parts.slice(0, i));
    const container = node as Record<string, unknown>;
    let next = Array.isArray(container) ? container[Number(p)] : container[p];
    if (next === undefined || next === null) {
      if (!create) throw new PathError(`Nothing at "${show(parts.slice(0, i + 1))}".`);
      const after = parts[i + 1];
      next = typeof after !== "string" || isIndex(after) || after === "-" ? [] : {};
      if (Array.isArray(container)) container[Number(p)] = next; else container[p] = next;
    }
    node = next;
  }
  if (node === null || typeof node !== "object") throw new PathError(`"${show(parts.slice(0, -1))}" is not an object or list.`);
  return { parent: node, last: resolve(node, parts[parts.length - 1], parts.slice(0, -1)) };
}

/** The value at a path, or undefined. */
export function getAt(doc: unknown, path: string): unknown {
  let node: unknown = doc;
  const parts = parsePath(path);
  for (let i = 0; i < parts.length; i++) {
    if (node === null || typeof node !== "object") return undefined;
    const p = resolve(node, parts[i], parts.slice(0, i));
    node = Array.isArray(node) ? node[Number(p)] : (node as Record<string, unknown>)[p];
  }
  return node;
}

/** The field a list's items are told apart by: the first of id/path/code/key the new item has. */
const idKeyOf = (item: unknown, by?: string) => by ?? ID_KEYS.find((k) => item && typeof item === "object" && typeof (item as Record<string, unknown>)[k] === "string");

export function applyOps<T extends object>(doc: T, ops: Op[]): T {
  const out = structuredClone(doc) as Record<string, unknown>;
  for (const o of ops) {
    const parts = parsePath(o.path);
    if (!parts.length) throw new PathError("Empty path.");
    const { parent, last } = walk(out, parts, o.op !== "remove");
    const at = `"${o.path}"`;
    const box = parent as Record<string, unknown>;
    const needValue = () => { if (o.op !== "remove" && o.value === undefined) throw new PathError(`${at}: "${o.op}" needs a value.`); };
    if (o.op === "set") {
      if (o.value === undefined) throw new PathError(`${at}: "set" needs a value (use "remove" to delete).`);
      if (Array.isArray(parent)) {
        if (last === "-") { parent.push(o.value); continue; }
        if (!isIndex(last) || Number(last) > parent.length) throw new PathError(`${at}: index out of range (list has ${parent.length}).`);
        parent[Number(last)] = o.value;
      } else box[last] = o.value;
    } else if (o.op === "merge") {
      needValue();
      const current = Array.isArray(parent) ? parent[Number(last)] : box[last];
      const merged = deepMerge(current ?? {}, o.value);
      if (Array.isArray(parent)) parent[Number(last)] = merged; else box[last] = merged;
    } else if (o.op === "append") {
      needValue();
      const target = box[last];
      if (target === undefined) { box[last] = [o.value]; continue; }
      if (!Array.isArray(target)) throw new PathError(`${at}: not a list.`);
      target.push(o.value);
    } else if (o.op === "insert") {
      needValue();
      if (!Array.isArray(parent) || !isIndex(last) || Number(last) > parent.length) throw new PathError(`${at}: "insert" needs a list position, e.g. "schedule.slots.0".`);
      parent.splice(Number(last), 0, o.value);
    } else if (o.op === "upsert") {
      needValue();
      const key = idKeyOf(o.value, o.by);
      if (!key) throw new PathError(`${at}: "upsert" needs an item with one of ${ID_KEYS.join("/")} (or pass "by").`);
      const want = (o.value as Record<string, unknown>)[key];
      if (want === undefined) throw new PathError(`${at}: the item has no "${key}".`);
      if (box[last] === undefined) { box[last] = [o.value]; continue; }
      const list = box[last];
      if (!Array.isArray(list)) throw new PathError(`${at}: not a list.`);
      const i = list.findIndex((x) => x && typeof x === "object" && (x as Record<string, unknown>)[key] === want);
      if (i < 0) list.push(o.value); else list[i] = o.value;
    } else if (o.op === "remove") {
      if (Array.isArray(parent)) {
        if (!isIndex(last) || Number(last) >= parent.length) throw new PathError(`${at}: index out of range (list has ${parent.length}).`);
        parent.splice(Number(last), 1);
      } else {
        if (!(last in box)) throw new PathError(`${at}: nothing to remove.`);
        delete box[last];
      }
    } else {
      throw new PathError(`Unknown op "${(o as { op: string }).op}".`);
    }
  }
  return out as T;
}

/* ---------------- the same edit on a second copy ---------------- */

const idKeyOfList = (list: unknown[]) =>
  list.length === 0 ? undefined : ID_KEYS.find((k) => list.every((x) => x && typeof x === "object" && typeof (x as Record<string, unknown>)[k] === "string")
    && new Set(list.map((x) => (x as Record<string, unknown>)[k])).size === list.length);

const render = (segs: Seg[]) => segs.map((x, i) => (typeof x === "string" ? (i ? `.${x}` : x) : `[${x.key}=${x.value}]`)).join("");

/** One op with every list position that points at an item with an id rewritten to that id (quizzes.12.title → quizzes[path=exam-6].title). */
function canonicalOp(doc: unknown, op: Op): Op {
  const parts = parsePath(op.path);
  let node: unknown = doc;
  const out: Seg[] = [];
  for (let i = 0; i < parts.length; i++) {
    let seg = parts[i];
    if (Array.isArray(node) && typeof seg === "string" && isIndex(seg)) {
      const key = idKeyOfList(node);
      const item = node[Number(seg)] as Record<string, unknown> | undefined;
      if (key && item && !String(item[key]).includes("]")) seg = { key, value: String(item[key]) };
    }
    out.push(seg);
    if (node === null || typeof node !== "object") break;
    try {
      const k = resolve(node, seg, parts.slice(0, i));
      node = Array.isArray(node) ? node[Number(k)] : (node as Record<string, unknown>)[k];
    } catch { node = undefined; }
  }
  return { ...op, path: render(out) } as Op;
}

/** The ops with positions turned into ids, each read against the document as the ops before it left it. */
export function canonicalOps(doc: object, ops: Op[]): Op[] {
  const out: Op[] = [];
  let cur = doc;
  for (const op of ops) {
    const c = canonicalOp(cur, op);
    out.push(c);
    cur = applyOps(cur, [c]);
  }
  return out;
}

/**
 * Applies ops made on `source` to `copy`, a second version of the same document (the
 * preview next to the live site). Ops reach their item by id, so a list that differs
 * between the two copies (a draft quiz only the preview has) can't make an edit land on the
 * wrong item. An op that can't be placed safely is skipped and named instead of guessed.
 */
export function mirrorOps<T extends object>(source: T, copy: T, ops: Op[]): { doc: T; skipped: string[] } {
  let src: object = source;
  let doc: object = copy;
  const skipped: string[] = [];
  for (const op of canonicalOps(source, ops)) {
    // A position that still points into a list without ids is only the same item while the two lists agree.
    const positional = parsePath(op.path).some((x, i, all) => typeof x === "string" && isIndex(x) && i < all.length);
    const same = !positional || op.op === "append" || op.op === "upsert" || JSON.stringify(getAt(src, op.path)) === JSON.stringify(getAt(doc, op.path));
    try {
      if (!same) throw new PathError("copies differ here");
      doc = applyOps(doc, [op]);
    } catch { skipped.push(op.path); }
    src = applyOps(src, [op]);
  }
  return { doc: doc as T, skipped };
}

/* ---------------- what changed ---------------- */

export type Change = { path: string; before?: unknown; after?: unknown };

const clip = (v: unknown): unknown => {
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  if (Array.isArray(v)) return `[list of ${v.length}]`;
  if (v && typeof v === "object") { const s = JSON.stringify(v); return s.length > 160 ? `${s.slice(0, 160)}…` : v; }
  return v;
};

/** A list item's path step: by its id when the items have distinct ones, else its position. */
function stepsFor(list: unknown[]): ((i: number) => string) {
  const key = ID_KEYS.find((k) => list.length > 0 && list.every((x) => x && typeof x === "object" && typeof (x as Record<string, unknown>)[k] === "string")
    && new Set(list.map((x) => (x as Record<string, unknown>)[k])).size === list.length);
  return (i) => (key ? `[${key}=${(list[i] as Record<string, unknown>)[key]}]` : `.${i}`);
}

/** The changed values between two documents (lists whose items have ids are matched by id). */
export function diff(a: unknown, b: unknown, path = "", out: Change[] = []): Change[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const obj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  if (Array.isArray(a) && Array.isArray(b)) {
    const sa = stepsFor(a), sb = stepsFor(b);
    // An empty list counts as "by id", so the first item added reads quizzes[path=…], not the whole list.
    const ids = (list: unknown[], step: (i: number) => string) => list.length === 0 || step(0).startsWith("[");
    const byId = a.length + b.length > 0 && ids(a, sa) && ids(b, sb);
    if (byId) {
      const ia = new Map(a.map((x, i) => [sa(i), x])), ib = new Map(b.map((x, i) => [sb(i), x]));
      for (const [k, v] of ia) if (!ib.has(k)) out.push({ path: path + k, before: clip(v) }); else diff(v, ib.get(k), path + k, out);
      for (const [k, v] of ib) if (!ia.has(k)) out.push({ path: path + k, after: clip(v) });
      if ([...ia.keys()].filter((k) => ib.has(k)).join() !== [...ib.keys()].filter((k) => ia.has(k)).join()) out.push({ path, before: "order", after: "new order" });
      return out;
    }
    if (a.length === b.length && a.every((x, i) => obj(x) && obj(b[i]))) { a.forEach((x, i) => diff(x, b[i], `${path}.${i}`, out)); return out; }
    out.push({ path, before: clip(a), after: clip(b) });
    return out;
  }
  if (obj(a) && obj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const next = path ? `${path}.${k}` : k;
      if (!(k in b) || b[k] === undefined) { if (a[k] !== undefined) out.push({ path: next, before: clip(a[k]) }); }
      else if (!(k in a) || a[k] === undefined) out.push({ path: next, after: clip(b[k]) });
      else diff(a[k], b[k], next, out);
    }
    return out;
  }
  out.push({ path, before: clip(a), after: clip(b) });
  return out;
}

/* ---------------- a short view of the content ---------------- */

const LABELS = ["title", "name", "label", "text", "q", "question"];

/** What a list holds: how many items, and their ids (or short titles) to address them by. */
function listSummary(list: unknown[]): unknown {
  if (!list.some((x) => x && typeof x === "object")) return `${list.length} values`;
  const key = ID_KEYS.find((k) => list.some((x) => x && typeof x === "object" && typeof (x as Record<string, unknown>)[k] === "string"));
  const label = (x: unknown) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    if (key && typeof o[key] === "string") return o[key];
    const title = LABELS.map((k) => o[k]).find((v) => typeof v === "string" && v) as string | undefined;
    return title ? (title.length > 28 ? `${title.slice(0, 28)}…` : title) : "…";
  };
  return { count: list.length, [key ?? "titles"]: list.slice(0, 25).map(label), ...(list.length > 25 ? { more: list.length - 25 } : {}) };
}

/**
 * Each top-level content key in a few words: a section's field names, and its lists with
 * their size and item ids. No text: enough to decide what to read next and how to address it.
 */
export function summarize(content: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(content).filter(([k]) => k !== "$schema").map(([k, v]) => {
    if (Array.isArray(v)) return [k, k === "sections" ? v : listSummary(v)];
    if (!v || typeof v !== "object") return [k, typeof v === "string" && v.length > 40 ? `${v.slice(0, 40)}…` : v];
    const entries = Object.entries(v as Record<string, unknown>);
    // Styled text (a title's [{text, style}] pieces) is a field, not a list of items.
    const styledText = (x: unknown[]) => x.every((i) => i && typeof i === "object" && Object.keys(i).every((n) => n === "text" || n === "style"));
    const lists = entries.filter(([, x]) => Array.isArray(x) && x.some((i) => i && typeof i === "object") && !styledText(x));
    const fields = entries.filter(([name]) => !lists.some(([l]) => l === name)).map(([name]) => name).join(", ");
    return [k, { fields, ...Object.fromEntries(lists.map(([name, x]) => [name, listSummary(x as unknown[])])) }];
  }));
}

/** Deep merge for partial theme updates: objects merge, everything else replaces. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || !base || typeof base !== "object" || Array.isArray(base)) return patch as T;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (FORBIDDEN.has(k)) continue;
    out[k] = deepMerge(out[k], v);
  }
  return out as T;
}

type JS = Record<string, unknown> & { properties?: Record<string, JS>; items?: JS; anyOf?: JS[]; additionalProperties?: JS | boolean };

/** Adds the admin panel's labels and hints (Arabic) as title/description to a JSON schema. */
function annotate(s: JS, path: string, key: string): JS {
  const out: JS = { ...s };
  const label = labelFor(path, key);
  if (key && label !== key) out.title = label;
  const hint = hintFor(path);
  if (hint) out.description = hint;
  if (s.widget === "image") out.description = [hint, "Image: a key from upload_image / list_images (e.g. \"uploads/...jpg\") or a full https URL."].filter(Boolean).join(" ");
  if (s.widget === "date") out.description = [hint, "Date \"YYYY-MM-DD\" (end of that day, Cairo) or \"YYYY-MM-DDTHH:MM\"."].filter(Boolean).join(" ");
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, annotate(v, path ? `${path}.${k}` : k, k)]));
  if (s.items) out.items = annotate(s.items, path, key);
  if (s.anyOf) out.anyOf = s.anyOf.map((b) => annotate(b, path, key));
  if (s.additionalProperties && typeof s.additionalProperties === "object") out.additionalProperties = annotate(s.additionalProperties, path, key);
  return out;
}

/** JSON schema of one top-level content key ("hero", "schedule"...) or "theme", annotated for an agent. */
export function schemaFor(part: string): JS | null {
  if (part === "theme") return annotate(themeJsonSchema as JS, "", "");
  const s = (contentJsonSchema as JS).properties?.[part];
  return s ? annotate(s, part, part) : null;
}

/**
 * The schema of a value inside a part, by content path ("quizzes.questions",
 * "schedule.slots[id=A].time": positions and picked items mean "one item of the list").
 */
export function schemaAt(path: string): JS | null {
  const parts = parsePath(path);
  const first = parts.shift();
  if (typeof first !== "string") return null;
  let node: JS | null = schemaFor(first);
  for (const seg of parts) {
    if (!node) return null;
    // An optional value is "anyOf [thing, null]": go into the thing.
    const real: JS = node.anyOf?.find((b) => b.properties || b.items) ?? node;
    if (typeof seg !== "string" || isIndex(seg) || seg === "-") node = real.items ?? null;
    else node = real.properties?.[seg] ?? real.items?.properties?.[seg] ?? null;
  }
  return node;
}

/** A schema in a few words, for an error message: its type, choices and required fields. */
export function expectedAt(path: string): string | null {
  let s: JS | null;
  try { s = schemaAt(path); } catch { return null; }
  if (!s) return null;
  const real: JS = s.anyOf?.find((b) => b.type !== "null") ?? s;
  const bits: string[] = [];
  if (real.enum) bits.push(`one of ${(real.enum as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`);
  else if (real.type === "array") bits.push("a list");
  else if (real.type === "object") bits.push(`an object${Array.isArray(real.required) && real.required.length ? ` with ${(real.required as string[]).join(", ")}` : ""}`);
  else if (real.type) bits.push(String(real.type));
  if (real.pattern) bits.push(`matching ${real.pattern}`);
  if (typeof real.description === "string") bits.push(real.description);
  return bits.join("; ") || null;
}

/** Overview of every top-level content key: label, required or optional. */
export function contentOutline(): { key: string; label: string; required: boolean }[] {
  const root = contentJsonSchema as JS & { required?: string[] };
  return Object.keys(root.properties ?? {})
    .filter((k) => k !== "$schema")
    .map((k) => ({ key: k, label: labelFor(k, k), required: (root.required ?? []).includes(k) }));
}
