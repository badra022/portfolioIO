import "server-only";
import { contentJsonSchema, themeJsonSchema } from "@/lib/content-utils";
import { hintFor, labelFor } from "@/lib/admin/labels";

/**
 * Path edits on a teacher's content: "hero.headline.0", "schedule.slots.-" (append),
 * "exams.items.2.prize". Applied to a copy; the caller validates and saves the
 * result as one revision.
 */
export type Op =
  | { op: "set"; path: string; value?: unknown }
  | { op: "append"; path: string; value?: unknown }
  | { op: "insert"; path: string; value?: unknown }
  | { op: "remove"; path: string };

const parse = (path: string) => path.split(".").map((p) => p.trim()).filter((p) => p !== "");
const isIndex = (p: string) => /^\d+$/.test(p);
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

function walk(root: Record<string, unknown>, parts: string[], create: boolean): { parent: unknown; last: string } {
  let node: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (FORBIDDEN.has(p)) throw new Error(`Invalid path segment "${p}".`);
    const container = node as Record<string, unknown>;
    if (container === null || typeof container !== "object") throw new Error(`"${parts.slice(0, i).join(".")}" is not an object or list.`);
    let next = Array.isArray(container) ? container[Number(p)] : container[p];
    if (next === undefined || next === null) {
      if (!create) throw new Error(`Nothing at "${parts.slice(0, i + 1).join(".")}".`);
      next = isIndex(parts[i + 1]) || parts[i + 1] === "-" ? [] : {};
      if (Array.isArray(container)) container[Number(p)] = next; else container[p] = next;
    }
    node = next;
  }
  const last = parts[parts.length - 1];
  if (FORBIDDEN.has(last)) throw new Error(`Invalid path segment "${last}".`);
  return { parent: node, last };
}

export function applyOps<T extends object>(doc: T, ops: Op[]): T {
  const out = structuredClone(doc) as Record<string, unknown>;
  for (const o of ops) {
    const parts = parse(o.path);
    if (!parts.length) throw new Error("Empty path.");
    const { parent, last } = walk(out, parts, o.op !== "remove");
    const at = `"${o.path}"`;
    if (parent === null || typeof parent !== "object") throw new Error(`${at}: parent is not an object or list.`);
    if (o.op === "set") {
      if (o.value === undefined) throw new Error(`${at}: "set" needs a value (use "remove" to delete).`);
      if (Array.isArray(parent)) {
        if (last === "-") { parent.push(o.value); continue; }
        if (!isIndex(last) || Number(last) > parent.length) throw new Error(`${at}: index out of range (list has ${parent.length}).`);
        parent[Number(last)] = o.value;
      } else (parent as Record<string, unknown>)[last] = o.value;
    } else if (o.op === "append" || o.op === "insert") {
      const target = o.op === "append" ? (parent as Record<string, unknown>)[last] : parent;
      if (o.op === "append") {
        if (target === undefined) { (parent as Record<string, unknown>)[last] = [o.value]; continue; }
        if (!Array.isArray(target)) throw new Error(`${at}: not a list.`);
        target.push(o.value);
      } else {
        if (!Array.isArray(parent) || !isIndex(last) || Number(last) > parent.length) throw new Error(`${at}: "insert" needs a list index, e.g. "schedule.slots.0".`);
        parent.splice(Number(last), 0, o.value);
      }
    } else if (o.op === "remove") {
      if (Array.isArray(parent)) {
        if (!isIndex(last) || Number(last) >= parent.length) throw new Error(`${at}: index out of range (list has ${parent.length}).`);
        parent.splice(Number(last), 1);
      } else {
        if (!(last in (parent as object))) throw new Error(`${at}: nothing to remove.`);
        delete (parent as Record<string, unknown>)[last];
      }
    } else {
      throw new Error(`Unknown op "${(o as { op: string }).op}".`);
    }
  }
  return out as T;
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

/** Overview of every top-level content key: label, required or optional. */
export function contentOutline(): { key: string; label: string; required: boolean }[] {
  const root = contentJsonSchema as JS & { required?: string[] };
  return Object.keys(root.properties ?? {})
    .filter((k) => k !== "$schema")
    .map((k) => ({ key: k, label: labelFor(k, k), required: (root.required ?? []).includes(k) }));
}
