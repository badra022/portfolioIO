/**
 * All runtime configuration in one place. Values come from Vercel project
 * settings (Settings -> Environment Variables) or .env.local when developing.
 */
const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const env = {
  /** Supabase Postgres, transaction pooler (port 6543). Without it the app reads /tenants files (read-only). */
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** https://<project-ref>.supabase.co */
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  /** Supabase secret key (sb_secret_...). Server only, never exposed to the browser. */
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  /** Public Supabase Storage bucket for teacher images. */
  storageBucket: process.env.STORAGE_BUCKET || "tenant-assets",
  /** Your own domain for the platform, e.g. "portfolioio.com". Teachers also get <slug>.<rootDomain>. */
  rootDomain: (process.env.ROOT_DOMAIN ?? "").toLowerCase(),
  /** Extra hosts that show the platform console instead of a teacher site (comma separated). */
  platformHosts: list(process.env.PLATFORM_HOSTS),
  /** Super admin login (can edit every teacher and manage the platform). */
  adminUser: process.env.ADMIN_USER ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  /** Secret for the MCP server (/api/mcp) and its upload links. 32+ random characters; empty turns the MCP server off. */
  mcpToken: process.env.MCP_TOKEN ?? "",
  /**
   * "dev" on the developer environment (Vercel Preview deployments: the develop
   * branch and feature branches), which has its own database and storage. The
   * whole dev site then asks for the admin login and is never indexed.
   */
  stage: process.env.APP_STAGE === "dev" ? ("dev" as const) : ("production" as const),
};

export const isDev = () => env.stage === "dev";

export const hasDb = () => Boolean(env.databaseUrl);
export const hasSupabaseStorage = () => Boolean(env.supabaseUrl && env.supabaseSecretKey);
