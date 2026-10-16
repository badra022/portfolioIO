import "server-only";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * The running app's half of the dev/production separation (scripts/db-stage.mjs
 * is the migrations' half): at startup the server reads the database's stage
 * marker and, if it belongs to the other environment, refuses every database
 * call. A dev site can then never read or write production data, even when its
 * DATABASE_URL is wrong.
 */
const g = globalThis as unknown as { __portfolioStage?: { ok: true } | { ok: false; error: string } };

const refOf = (url: string) => {
  try { return new URL(url).hostname.split(".")[0] || null; } catch { return null; }
};

export async function verifyStage(): Promise<void> {
  if (!env.databaseUrl) return;
  const sql = postgres(env.databaseUrl, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    const rows = await sql<{ stage: string; supabase_ref: string | null }[]>`select stage, supabase_ref from public._portfolio_stage limit 1`
      .catch(() => [] as { stage: string; supabase_ref: string | null }[]);
    const row = rows[0];
    const ref = refOf(env.supabaseUrl);
    if (!row) g.__portfolioStage = { ok: false, error: `The database has no stage marker, so it can't be confirmed as the ${env.stage} database.` };
    else if (row.stage !== env.stage) g.__portfolioStage = { ok: false, error: `Wrong database: it is the ${row.stage} database but this deployment is ${env.stage}.` };
    else if (row.supabase_ref && ref && ref !== row.supabase_ref) g.__portfolioStage = { ok: false, error: `Wrong file storage: SUPABASE_URL is project ${ref}, the ${env.stage} database belongs with ${row.supabase_ref}.` };
    else g.__portfolioStage = { ok: true };
  } catch (e) {
    // Can't reach the database at all: leave it to the normal error handling.
    console.error("stage check", e);
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (g.__portfolioStage && !g.__portfolioStage.ok) console.error(`[stage] ${g.__portfolioStage.error} Every database call is refused.`);
}

/** Throws when the startup check found the other environment's database. */
export function assertStage(): void {
  const s = g.__portfolioStage;
  if (s && !s.ok) throw new Error(s.error);
}
