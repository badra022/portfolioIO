import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ContentSchema, DeploySchema, ThemeSchema, type Content, type Deploy, type Theme } from "./schema";

export const TENANTS_DIR = path.join(process.cwd(), "tenants");

/** Which teacher this build is for: TENANT env var, else the first folder. */
export function resolveTenantSlug(): string {
  const fromEnv = process.env.TENANT?.trim();
  if (fromEnv) return fromEnv;
  const first = fs.readdirSync(TENANTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort()[0];
  if (!first) throw new Error("No tenants found in /tenants.");
  return first;
}

function readJson(slug: string, file: string): unknown {
  const p = path.join(TENANTS_DIR, slug, file);
  if (!fs.existsSync(p)) throw new Error(`Missing ${file} for tenant "${slug}" (${p}).`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown, label: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid ${label}:\n${lines}`);
  }
  return r.data;
}

export type Tenant = { slug: string; content: Content; theme: Theme; deploy: Deploy };

let cached: Tenant | null = null;

export function getTenant(): Tenant {
  if (cached) return cached;
  const slug = resolveTenantSlug();
  const content = parse(ContentSchema, readJson(slug, "content.json"), `${slug}/content.json`) as Content;
  const theme = parse(ThemeSchema, readJson(slug, "theme.json"), `${slug}/theme.json`) as Theme;
  const deploy = parse(DeploySchema, readJson(slug, "deploy.json"), `${slug}/deploy.json`) as Deploy;
  if (content.slug !== slug) throw new Error(`content.json slug "${content.slug}" must match folder name "${slug}".`);
  cached = { slug, content, theme, deploy };
  return cached;
}
