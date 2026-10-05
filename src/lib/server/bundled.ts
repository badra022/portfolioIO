import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Teachers bundled in the repo under /tenants/<slug>. Used to seed the database
 * (platform console -> Import) and as a read-only data source when no database is configured.
 */
export const TENANTS_DIR = path.join(process.cwd(), "tenants");

export function listBundled(): string[] {
  if (!fs.existsSync(TENANTS_DIR)) return [];
  return fs.readdirSync(TENANTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && fs.existsSync(path.join(TENANTS_DIR, d.name, "content.json")))
    .map((d) => d.name)
    .sort();
}

export function readBundledJson(slug: string, file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(TENANTS_DIR, slug, file), "utf8"));
}

const B64 = /^(.+)\.b64(?:\.(\d+))?$/;
const MIME: Record<string, string> = {
  webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", avif: "image/avif",
  gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf",
};
export const mimeFor = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** Assets of a bundled teacher, with base64 text files (name.b64, name.b64.001...) decoded. */
export function readBundledAssets(slug: string): { name: string; bytes: Buffer; contentType: string }[] {
  const dir = path.join(TENANTS_DIR, slug, "assets");
  if (!fs.existsSync(dir)) return [];
  const out: { name: string; bytes: Buffer; contentType: string }[] = [];
  const encoded = new Map<string, [number, string][]>();
  const walk = (from: string, prefix: string) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const full = path.join(from, e.name);
      if (e.isDirectory()) { walk(full, `${prefix}${e.name}/`); continue; }
      const m = e.name.match(B64);
      if (m) {
        const target = `${prefix}${m[1]}`;
        if (!encoded.has(target)) encoded.set(target, []);
        encoded.get(target)!.push([Number(m[2] ?? 0), full]);
      } else {
        out.push({ name: `${prefix}${e.name}`, bytes: fs.readFileSync(full), contentType: mimeFor(e.name) });
      }
    }
  };
  walk(dir, "");
  for (const [name, parts] of encoded) {
    if (out.some((o) => o.name === name)) continue; // a real binary wins
    const text = parts.sort((a, b) => a[0] - b[0]).map(([, f]) => fs.readFileSync(f, "utf8")).join("");
    out.push({ name, bytes: Buffer.from(text.replace(/\s+/g, ""), "base64"), contentType: mimeFor(name) });
  }
  return out;
}
