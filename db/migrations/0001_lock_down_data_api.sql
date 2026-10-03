-- Supabase exposes tables in the public schema through its Data API (PostgREST).
-- The app talks to Postgres directly, never through that API, so turn RLS on with
-- no policies: anon/authenticated keys can then read or write nothing here
-- (including password hashes). The app's own connection is the table owner and is unaffected.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "tenants", "tenant_domains", "admin_users", "tenant_revisions" FROM anon, authenticated;
