// Which environment a database belongs to, so the dev site can never use the
// production database (or the other way round), whatever the environment
// variables say. Each database holds one row in public._portfolio_stage:
//   stage         'dev' or 'production'
//   supabase_ref  the Supabase project its files live in (optional), checked
//                 against SUPABASE_URL so storage can't be crossed either.
// The row is written once by hand when a database is set up (see README,
// "Environments & releases"); a brand-new empty database is marked with the
// current stage automatically. Used by scripts/db-migrate.mjs; the running app
// does the same check in src/lib/db/stage.ts.

export const expectedStage = () => (process.env.APP_STAGE === "dev" ? "dev" : "production");

const refOf = (url) => {
  try { return new URL(url).hostname.split(".")[0] || null; } catch { return null; }
};

/** Throws unless the database is marked for this stage. */
export async function checkStage(sql, { initEmpty = false } = {}) {
  const want = expectedStage();
  const [{ exists }] = await sql`select to_regclass('public._portfolio_stage') is not null as exists`;
  if (!exists) {
    const [{ used }] = await sql`select (to_regclass('public._portfolio_migrations') is not null or to_regclass('public.tenants') is not null) as used`;
    if (used || !initEmpty) {
      throw new Error(`This database has no stage marker (public._portfolio_stage), so it can't be confirmed as the ${want} database. Refusing to touch it.`);
    }
    await sql`create table public._portfolio_stage (id boolean primary key default true check (id), stage text not null check (stage in ('dev', 'production')), supabase_ref text, set_at timestamptz not null default now())`;
    await sql`alter table public._portfolio_stage enable row level security`;
    await sql`insert into public._portfolio_stage (stage, supabase_ref) values (${want}, ${refOf(process.env.SUPABASE_URL ?? "")})`;
    console.log(`marked this new database as ${want}`);
    return;
  }
  const [row] = await sql`select stage, supabase_ref from public._portfolio_stage limit 1`;
  if (!row) throw new Error("public._portfolio_stage is empty: this database's stage is unknown. Refusing to touch it.");
  if (row.stage !== want) {
    throw new Error(`Wrong database: this is the ${row.stage} database, but this deployment is ${want} (APP_STAGE=${process.env.APP_STAGE ?? "unset"}). Fix DATABASE_URL for this environment.`);
  }
  const ref = refOf(process.env.SUPABASE_URL ?? "");
  if (row.supabase_ref && ref && ref !== row.supabase_ref) {
    throw new Error(`Wrong file storage: SUPABASE_URL points to project ${ref}, but the ${want} database belongs with ${row.supabase_ref}. Fix SUPABASE_URL for this environment.`);
  }
}
