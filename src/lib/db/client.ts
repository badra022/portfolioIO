import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";
import { assertStage } from "./stage";

type Db = PostgresJsDatabase<typeof schema>;
type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __portfolioDb?: Db; __portfolioSql?: Sql };

/**
 * A query the database never answers within this time fails, and the pool is dropped
 * (the next query opens fresh connections). On Vercel a function can be paused in the
 * middle of a query and resumed later; its connection then looks open but nothing ever
 * comes back, and every request queued behind it would wait until the 300 s limit.
 */
const QUERY_MS = 20_000;

/** One small connection pool per server instance, through Supabase's session pooler (sessionUrl). */
export function db(): Db {
  // Never the other environment's database (lib/db/stage.ts).
  assertStage();
  if (g.__portfolioDb) return g.__portfolioDb;
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not set.");
  // max_pipeline 1: one query at a time per connection. By default postgres.js sends more
  // queries down a connection that is still busy (pipelining) once all of them are in use;
  // Supabase's transaction pooler (port 6543) can hand a pipelined query to a backend that
  // never answers it, and the page waits forever (the super admin's home, which runs the
  // most queries at once, hung on every load). Queries now wait for a free connection.
  // Short-lived connections, so few of them are open when the function is paused.
  // (max_pipeline is a real postgres.js option, read in its src/index.js, but missing from its types.)
  const noPipeline = { max_pipeline: 1 } as Record<string, number>;
  const client = postgres(sessionUrl(env.databaseUrl), { prepare: false, max: 5, idle_timeout: 10, max_lifetime: 5 * 60, connect_timeout: 10, ...noPipeline });
  guard(client);
  g.__portfolioSql = client;
  g.__portfolioDb = drizzle(client, { schema });
  return g.__portfolioDb;
}

/**
 * Supabase's pooler in session mode (port 5432) instead of transaction mode (6543).
 * With prepare:false, postgres.js sends every query that has parameters in two steps
 * (Parse + Describe + Flush, then Bind + Execute + Sync). In transaction mode the pooler
 * picks a database backend per transaction and can park the first step without ever
 * forwarding it: production showed Postgres idle while the app waited (the super admin
 * pages hung, then timed out). In session mode each app connection keeps one backend
 * for its lifetime, so both steps always reach it. DB_POOL_MODE=transaction keeps 6543.
 */
function sessionUrl(raw: string): string {
  if (process.env.DB_POOL_MODE === "transaction") return raw;
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") { u.port = "5432"; return u.toString(); }
  } catch { /* not a URL: use as is */ }
  return raw;
}

export class DbTimeoutError extends Error {
  constructor() { super(`The database didn't answer within ${QUERY_MS / 1000} s.`); }
}

/** Drops a pool whose connection hung, so the next db() call starts a new one. */
function recycle(client: Sql) {
  if (g.__portfolioSql !== client) return;
  g.__portfolioSql = undefined;
  g.__portfolioDb = undefined;
  void client.end({ timeout: 0 }).catch(() => {});
}

/**
 * Puts a time limit on every query drizzle runs (it goes through sql.unsafe). postgres.js
 * queries run when first awaited, so the timer starts then; .values() and the other
 * modifiers return the same query object and keep the limit.
 */
function guard(client: Sql) {
  const unsafe = client.unsafe.bind(client);
  (client as { unsafe: unknown }).unsafe = (...args: Parameters<Sql["unsafe"]>) => {
    const q = unsafe(...args);
    const then = q.then.bind(q);
    (q as { then: unknown }).then = (ok?: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          console.error(`[db] query timed out after ${QUERY_MS} ms; dropping the connection pool`);
          reject(new DbTimeoutError());
          recycle(client);
        }, QUERY_MS);
        then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
      }).then(ok, fail);
    return q;
  };
}

export { schema };
