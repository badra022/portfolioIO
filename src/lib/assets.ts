/** Tenant assets are copied to /public/tenant at build time (see scripts/prepare-tenant.mjs). */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset(file: string): string {
  if (/^https?:\/\//.test(file)) return file;
  return `${BASE}/tenant/${file.replace(/^\/+/, "")}`;
}
