-- portfolioIO: one-time database setup for Supabase.
-- Open Supabase > SQL Editor > New query, paste EVERYTHING in this file (the SQL text itself, not the file name), then click Run.
-- Safe to run once on an empty project. Generated from db/migrations/0000 + 0001 + 0002.
-- Already set up before analytics existed? Run only db/migrations/0002_analytics.sql instead.

CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);

CREATE TABLE "tenant_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tenant_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"theme" jsonb NOT NULL,
	"author" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"content" jsonb NOT NULL,
	"theme" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);

ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tenant_revisions" ADD CONSTRAINT "tenant_revisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "admin_users_tenant_idx" ON "admin_users" USING btree ("tenant_id");
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id");
CREATE INDEX "tenant_revisions_tenant_idx" ON "tenant_revisions" USING btree ("tenant_id","created_at");

-- Supabase exposes tables in the public schema through its Data API (PostgREST).
-- The app talks to Postgres directly, never through that API, so turn RLS on with
-- no policies: anon/authenticated keys can then read or write nothing here
-- (including password hashes). The app's own connection is the table owner and is unaffected.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_revisions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "tenants", "tenant_domains", "admin_users", "tenant_revisions" FROM anon, authenticated;

-- Site analytics (0002): daily counters per teacher, no visitor data.
CREATE TABLE "analytics_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_daily_tenant_id_day_metric_key_pk" PRIMARY KEY("tenant_id","day","metric","key")
);
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "analytics_daily" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "analytics_daily" FROM anon, authenticated;
