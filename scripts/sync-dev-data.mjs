// Copies the teachers' pages from production to the dev environment, without any
// student data. Run from GitHub Actions ("refresh-dev-data" workflow, Run workflow).
//
// Copied:    tenants (content, theme, the admin preview copy, status, plan) and every image in
//            the storage bucket.
// Never:     submissions, quiz_attempts, analytics_daily, exam_results (students' names,
//            phones, grades), admin_users (teachers' passwords), tenant_domains (dev serves
//            teachers at /t/<slug> only), tenant_revisions, tenant_files.
//
// Env: PROD_DATABASE_URL, DEV_DATABASE_URL, PROD_SUPABASE_URL, PROD_SUPABASE_SECRET_KEY,
//      DEV_SUPABASE_URL, DEV_SUPABASE_SECRET_KEY, optional STORAGE_BUCKET (tenant-assets).
import postgres from "postgres";

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
  return v.replace(/\/$/, "");
};
const prodDb = need("PROD_DATABASE_URL"), devDb = need("DEV_DATABASE_URL");
const prodUrl = need("PROD_SUPABASE_URL"), prodKey = need("PROD_SUPABASE_SECRET_KEY");
const devUrl = need("DEV_SUPABASE_URL"), devKey = need("DEV_SUPABASE_SECRET_KEY");
const bucket = process.env.STORAGE_BUCKET || "tenant-assets";
if (prodDb === devDb || prodUrl === devUrl) { console.error("Production and dev point to the same place. Stopping."); process.exit(1); }

const headers = (key, extra = {}) => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), ...extra });
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

/* ---------------- pages ---------------- */

const src = postgres(prodDb, { prepare: false, max: 1 });
const dst = postgres(devDb, { prepare: false, max: 1 });
try {
  // select *: production may not have the permissions column yet (before its release); it then had everything.
  const rows = await src`select * from tenants`;
  const ALL = { analytics: true, forms: true, exams: true, votes: true, promo: true };
  for (const r of rows) {
    await dst`
      insert into tenants (slug, name, status, content, theme, version, preview_content, preview_theme, preview_version, permissions, updated_by)
      values (${r.slug}, ${r.name}, ${r.status}, ${dst.json(r.content)}, ${dst.json(r.theme)}, ${r.version},
              ${r.preview_content === null ? null : dst.json(r.preview_content)}, ${r.preview_theme === null ? null : dst.json(r.preview_theme)}, ${r.preview_version}, ${dst.json(r.permissions ?? ALL)}, 'sync from production')
      on conflict (slug) do update set
        name = excluded.name, status = excluded.status, content = excluded.content, theme = excluded.theme,
        version = excluded.version, preview_content = excluded.preview_content, preview_theme = excluded.preview_theme,
        preview_version = excluded.preview_version, permissions = excluded.permissions, updated_at = now(), updated_by = excluded.updated_by`;
  }
  console.log(`pages: ${rows.length} teacher(s) copied (${rows.map((r) => r.slug).join(", ")})`);
} finally {
  await src.end();
  await dst.end();
}

/* ---------------- images ---------------- */

async function ensureDevBucket() {
  const res = await fetch(`${devUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(devKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (!res.ok && res.status !== 409) {
    const t = await res.text();
    if (!/already exists|Duplicate/i.test(t)) throw new Error(`dev bucket: ${res.status} ${t}`);
  }
}

/** Every object path under a prefix (folders are walked). */
async function listAll(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${prodUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: headers(prodKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`);
    const items = await res.json();
    for (const it of items) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id) out.push({ path: p, type: it.metadata?.mimetype ?? "application/octet-stream" });
      else out.push(...(await listAll(p)));
    }
    if (items.length < 1000) break;
  }
  return out;
}

await ensureDevBucket();
const files = await listAll();
let copied = 0;
for (const f of files) {
  const get = await fetch(`${prodUrl}/storage/v1/object/${bucket}/${enc(f.path)}`, { headers: headers(prodKey) });
  if (!get.ok) { console.warn(`skip ${f.path}: ${get.status}`); continue; }
  const put = await fetch(`${devUrl}/storage/v1/object/${bucket}/${enc(f.path)}`, {
    method: "POST",
    headers: headers(devKey, { "Content-Type": f.type, "x-upsert": "true", "cache-control": "max-age=31536000" }),
    body: Buffer.from(await get.arrayBuffer()),
  });
  if (!put.ok) { console.warn(`skip ${f.path}: ${put.status} ${await put.text()}`); continue; }
  copied++;
}
console.log(`images: ${copied}/${files.length} copied`);
