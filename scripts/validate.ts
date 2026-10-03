// Validates every tenant folder: JSON against the schemas, and that every
// referenced asset file exists. Run in CI before building.
import fs from "node:fs";
import path from "node:path";
import { ContentSchema, DeploySchema, ThemeSchema } from "../src/lib/schema.ts";

const dir = path.resolve(import.meta.dirname, "..", "tenants");
const tenants = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name);
let failed = false;

const read = (slug: string, f: string) => JSON.parse(fs.readFileSync(path.join(dir, slug, f), "utf8"));

for (const slug of tenants) {
  const errors: string[] = [];
  const results = [
    ["content.json", ContentSchema.safeParse(read(slug, "content.json"))],
    ["theme.json", ThemeSchema.safeParse(read(slug, "theme.json"))],
    ["deploy.json", DeploySchema.safeParse(read(slug, "deploy.json"))],
  ] as const;
  for (const [file, r] of results) {
    if (!r.success) for (const i of r.error.issues) errors.push(`${file} ${i.path.join(".")}: ${i.message}`);
  }
  const content = results[0][1];
  if (content.success) {
    const c = content.data;
    if (c.slug !== slug) errors.push(`content.json slug "${c.slug}" must equal folder "${slug}"`);
    const files = [c.profile.photo, c.profile.avatar, c.profile.logo, c.seo.ogImage, c.book?.cover, c.book?.backCover, c.students?.photo]
      .filter((f): f is string => typeof f === "string" && !/^https?:/.test(f));
    for (const f of files) {
      const base = path.join(dir, slug, "assets", f);
      if (!fs.existsSync(base) && !fs.existsSync(`${base}.b64`)) errors.push(`missing asset: assets/${f}`);
    }
  }
  if (errors.length) { failed = true; console.error(`✗ ${slug}\n  ${errors.join("\n  ")}`); }
  else console.log(`✓ ${slug}`);
}
process.exit(failed ? 1 : 0);
