// Copies the selected teacher's assets into public/tenant so the static
// export serves them at <basePath>/tenant/<file>.
//
// Binary assets may also be stored as base64 text next to their name
// (e.g. teacher.webp.b64), optionally split into numbered parts
// (teacher.webp.b64.001, .002, ...). They are decoded here, which lets assets
// be uploaded through tools that only accept text.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TENANTS_DIR, resolveTenant } from "./tenants.mjs";

const slug = resolveTenant();
const src = path.join(TENANTS_DIR, slug, "assets");
const dest = path.join(ROOT, "public", "tenant");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

// Matches "photo.webp.b64" and split parts "photo.webp.b64.001", "photo.webp.b64.002", ...
const B64 = /^(.+)\.b64(?:\.(\d+))?$/;

function copyDir(from, to) {
  const encoded = new Map(); // target name -> [[order, file], ...]
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(path.join(to, entry.name), { recursive: true });
      copyDir(s, path.join(to, entry.name));
      continue;
    }
    const m = entry.name.match(B64);
    if (m) {
      if (!encoded.has(m[1])) encoded.set(m[1], []);
      encoded.get(m[1]).push([Number(m[2] ?? 0), s]);
    } else {
      fs.copyFileSync(s, path.join(to, entry.name));
    }
  }
  for (const [name, parts] of encoded) {
    if (fs.existsSync(path.join(from, name))) continue; // a real binary wins
    const text = parts.sort((a, b) => a[0] - b[0]).map(([, f]) => fs.readFileSync(f, "utf8")).join("");
    fs.writeFileSync(path.join(to, name), Buffer.from(text.replace(/\s+/g, ""), "base64"));
  }
}

if (fs.existsSync(src)) copyDir(src, dest);
console.log(`[tenant] ${slug}: assets -> public/tenant`);
