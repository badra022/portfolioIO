import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const TENANTS_DIR = path.join(ROOT, "tenants");

/** Folder names under /tenants (folders starting with "_" are ignored). */
export function listTenants() {
  return fs.readdirSync(TENANTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}

export function readTenantJson(slug, file) {
  return JSON.parse(fs.readFileSync(path.join(TENANTS_DIR, slug, file), "utf8"));
}

export function resolveTenant() {
  const slug = process.env.TENANT?.trim() || listTenants()[0];
  if (!slug) throw new Error("No tenants found in /tenants.");
  if (!fs.existsSync(path.join(TENANTS_DIR, slug))) {
    throw new Error(`Tenant "${slug}" not found. Available: ${listTenants().join(", ")}`);
  }
  return slug;
}
