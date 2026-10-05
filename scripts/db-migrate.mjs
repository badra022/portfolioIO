// Applies db/migrations/*.sql in order and records them in public._portfolio_migrations.
// Usage: DATABASE_URL=postgresql://... npm run db:migrate
// (Alternatively paste the SQL files into Supabase -> SQL Editor, in order.)
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { ROOT } from "./tenants.mjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL first."); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const dir = path.join(ROOT, "db", "migrations");
try {
  await sql`create table if not exists public._portfolio_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._portfolio_migrations enable row level security`;
  const done = new Set((await sql`select name from public._portfolio_migrations`).map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      for (const stmt of text.split("--> statement-breakpoint")) if (stmt.trim()) await tx.unsafe(stmt);
      await tx`insert into public._portfolio_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("database is up to date");
} finally {
  await sql.end();
}
