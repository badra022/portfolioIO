// Copies the selected teacher's assets into public/tenant so the static
// export serves them at <basePath>/tenant/<file>.
//
// Binary assets may also be stored as base64 text next to their name
// (e.g. teacher.webp.b64). They are decoded here, which lets assets be
// uploaded through tools that only accept text.
import fs from "node:fs";
import path from "node:path";
import { ROOT, TENANTS_DIR, resolveTenant } from "./tenants.mjs";

const slug = resolveTenant();
const src = path.join(TENANTS_DIR, slug, "assets");
const dest = path.join(ROOT, "public", "tenant");

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

function copyDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(path.join(to, entry.name), { recursive: true });
      copyDir(s, path.join(to, entry.name));
    } else if (entry.name.endsWith(".b64")) {
      const target = path.join(to, entry.name.slice(0, -4));
      if (!fs.existsSync(path.join(from, entry.name.slice(0, -4)))) {
        fs.writeFileSync(target, Buffer.from(fs.readFileSync(s, "utf8").replace(/\s+/g, ""), "base64"));
      }
    } else {
      fs.copyFileSync(s, path.join(to, entry.name));
    }
  }
}

if (fs.existsSync(src)) copyDir(src, dest);
console.log(`[tenant] ${slug}: assets -> public/tenant`);
