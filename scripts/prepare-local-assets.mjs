// Development helper: decodes every bundled teacher's assets into .local-storage/<slug>/
// so pages work locally without Supabase Storage (served by app/local-assets).
// Base64 text files (photo.webp.b64, photo.webp.b64.001 ...) are decoded; a real binary wins.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TENANTS_DIR, listTenants } from "./tenants.mjs";

const B64 = /^(.+)\.b64(?:\.(\d+))?$/;
const OUT = path.join(ROOT, ".local-storage");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  const encoded = new Map();
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    if (entry.isDirectory()) { copyDir(s, path.join(to, entry.name)); continue; }
    const m = entry.name.match(B64);
    if (m) {
      if (!encoded.has(m[1])) encoded.set(m[1], []);
      encoded.get(m[1]).push([Number(m[2] ?? 0), s]);
    } else {
      fs.copyFileSync(s, path.join(to, entry.name));
    }
  }
  for (const [name, parts] of encoded) {
    if (fs.existsSync(path.join(from, name))) continue;
    const text = parts.sort((a, b) => a[0] - b[0]).map(([, f]) => fs.readFileSync(f, "utf8")).join("");
    fs.writeFileSync(path.join(to, name), Buffer.from(text.replace(/\s+/g, ""), "base64"));
  }
}

for (const slug of listTenants()) {
  const src = path.join(TENANTS_DIR, slug, "assets");
  if (fs.existsSync(src)) copyDir(src, path.join(OUT, slug));
  console.log(`[assets] ${slug} -> .local-storage/${slug}`);
}
