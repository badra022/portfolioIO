import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;
const g = globalThis as unknown as { __portfolioDb?: Db };

/** One small connection pool per server instance. prepare:false is required by Supabase's transaction pooler. */
export function db(): Db {
  if (g.__portfolioDb) return g.__portfolioDb;
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not set.");
  const client = postgres(env.databaseUrl, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
  g.__portfolioDb = drizzle(client, { schema });
  return g.__portfolioDb;
}

export { schema };
