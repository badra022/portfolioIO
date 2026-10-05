/** Helpers for walking the JSON Schemas the admin forms are generated from. Safe in client components. */
export type JS = {
  type?: string | string[];
  properties?: Record<string, JS>;
  required?: string[];
  items?: JS;
  anyOf?: JS[];
  enum?: (string | number)[];
  propertyNames?: JS;
  additionalProperties?: JS | boolean;
  default?: unknown;
  minItems?: number;
  pattern?: string;
  format?: string;
  widget?: string;
  [k: string]: unknown;
};

export type Kind = "object" | "record" | "map" | "array" | "enum" | "string" | "number" | "boolean" | "json";

/** Splits "string | null" style schemas into the real type plus a nullable flag. */
export function unwrap(s: JS): { inner: JS; nullable: boolean } {
  if (s.anyOf) {
    const rest = s.anyOf.filter((b) => b.type !== "null");
    if (rest.length === 1 && s.anyOf.length === 2) return { inner: { ...rest[0], default: s.default }, nullable: true };
  }
  if (Array.isArray(s.type) && s.type.includes("null")) {
    const t = s.type.filter((x) => x !== "null");
    if (t.length === 1) return { inner: { ...s, type: t[0] }, nullable: true };
  }
  return { inner: s, nullable: false };
}

export function kindOf(s: JS): Kind {
  if (s.enum) return "enum";
  if (s.type === "object" && s.propertyNames?.enum) return "record";
  if (s.type === "object" && s.properties) return "object";
  if (s.type === "object") return "map";
  if (s.type === "array") return "array";
  if (s.type === "string") return "string";
  if (s.type === "number" || s.type === "integer") return "number";
  if (s.type === "boolean") return "boolean";
  return "json";
}

/** A sensible empty value for a schema (used for "add" buttons). */
export function defaultFor(s: JS): unknown {
  if (s.default !== undefined) return structuredClone(s.default);
  const { inner, nullable } = unwrap(s);
  if (nullable) return null;
  switch (kindOf(inner)) {
    case "enum": return inner.enum![0];
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inner.properties ?? {})) {
        if (k === "$schema") continue;
        if (inner.required?.includes(k) || v.default !== undefined) out[k] = defaultFor(v);
      }
      return out;
    }
    case "record": {
      const out: Record<string, unknown> = {};
      for (const k of inner.propertyNames!.enum!) out[String(k)] = defaultFor(inner.additionalProperties as JS);
      return out;
    }
    case "map": return {};
    case "array": return Array.from({ length: inner.minItems ?? 0 }, () => defaultFor(inner.items ?? {}));
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    default: return null;
  }
}

/** Is this a container (object/array) rather than a single input? */
export const isComplex = (s: JS) => ["object", "record", "map", "array"].includes(kindOf(unwrap(s).inner));

/** Builds the schema of one admin page from the full content schema. */
export function pickSchema(root: JS, keys: string[]): JS {
  const properties: Record<string, JS> = {};
  for (const k of keys) if (root.properties?.[k]) properties[k] = root.properties[k];
  return { type: "object", properties, required: (root.required ?? []).filter((k) => keys.includes(k)) };
}
