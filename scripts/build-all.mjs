// Builds every enabled tenant into dist/<path>/.
//
//   TARGET=pages  (default) one shared GitHub Pages site:
//                 https://<owner>.github.io/<repo>/<githubPages.path>/
//                 needs PAGES_ORIGIN (https://<owner>.github.io) and PAGES_BASE_PATH (/<repo>)
//   TARGET=domain each tenant built for the root of its own domain (deploy.json "domain"),
//                 output in dist/<slug>/, ready for Cloudflare Pages or any static host.
//
// TENANTS=a,b limits the build to some tenants.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, listTenants, readTenantJson } from "./tenants.mjs";

const target = process.env.TARGET ?? "pages";
const only = process.env.TENANTS?.split(",").map((s) => s.trim()).filter(Boolean);
const origin = (process.env.PAGES_ORIGIN ?? "").replace(/\/$/, "");
const repoBase = (process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "");
const dist = path.join(ROOT, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const built = [];
for (const slug of listTenants()) {
  if (only && !only.includes(slug)) continue;
  const deploy = readTenantJson(slug, "deploy.json");
  const content = readTenantJson(slug, "content.json");
  if (!deploy.enabled) { console.log(`[skip] ${slug}: disabled`); continue; }

  let basePath = "", outDir = slug, siteUrl = "";
  if (target === "pages") {
    if (!deploy.githubPages) { console.log(`[skip] ${slug}: no githubPages config`); continue; }
    outDir = deploy.githubPages.path;
    basePath = `${repoBase}/${outDir}`;
    siteUrl = origin ? `${origin}${basePath}/` : "";
  } else {
    siteUrl = deploy.domain ? `https://${deploy.domain}/` : "";
  }

  console.log(`\n[build] ${slug} -> dist/${outDir}  (basePath "${basePath || "/"}")`);
  const env = { ...process.env, TENANT: slug, BASE_PATH: basePath, SITE_URL: siteUrl };
  execSync("node scripts/prepare-tenant.mjs", { stdio: "inherit", env, cwd: ROOT });
  fs.rmSync(path.join(ROOT, "out"), { recursive: true, force: true });
  execSync("npx next build", { stdio: "inherit", env, cwd: ROOT });
  fs.cpSync(path.join(ROOT, "out"), path.join(dist, outDir), { recursive: true });
  built.push({ slug, outDir, name: content.profile.fullTitle, role: content.profile.role, url: siteUrl });
}

if (!built.length) { console.error("No tenants were built."); process.exit(1); }

if (target === "pages") {
  // GitHub Pages: skip Jekyll processing and add a small index of all teachers.
  fs.writeFileSync(path.join(dist, ".nojekyll"), "");
  const items = built.map((b) => `<li><a href="./${b.outDir}/"><b>${b.name}</b><span>${b.role}</span></a></li>`).join("\n");
  fs.writeFileSync(path.join(dist, "index.html"), `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>portfolioIO</title><meta name="robots" content="noindex">
<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;padding:24px}
ul{list-style:none;padding:0;margin:0;display:grid;gap:12px;width:min(420px,100%)}a{display:flex;flex-direction:column;padding:16px 20px;border:1px solid #333;border-radius:12px;text-decoration:none;color:inherit}a:hover{border-color:#777}span{color:#999;font-size:14px}</style>
</head><body><ul>${items}</ul></body></html>`);
}
fs.writeFileSync(path.join(dist, "tenants.json"), JSON.stringify(built, null, 2));
console.log(`\nBuilt ${built.length} tenant(s) into dist/.`);
