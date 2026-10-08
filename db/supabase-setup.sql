-- portfolioIO: one-time database setup for Supabase.
-- Open Supabase > SQL Editor > New query, paste EVERYTHING in this file (the SQL text itself, not the file name), then click Run.
-- Safe to run once on an empty project. Generated from db/migrations/0000 to 0004.
-- Already set up earlier? Run only the db/migrations files added since (0002_analytics.sql, 0003_submissions.sql, 0004_quizzes.sql), in order.

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

-- Form submissions (0003): what students send through form buttons.
CREATE TABLE "submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"fields" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;CREATE INDEX "submissions_tenant_created_idx" ON "submissions" USING btree ("tenant_id","created_at");-- Same lock-down as 0001: only the app's own connection can read or write submissions (they hold phone numbers).
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;REVOKE ALL ON "submissions" FROM anon, authenticated;

-- Quiz attempts (0004).
CREATE TABLE "quiz_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quiz_path" text NOT NULL,
	"token" text NOT NULL,
	"contact" text,
	"fields" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "quiz_attempts_token_unique" UNIQUE("token")
);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;CREATE INDEX "quiz_attempts_quiz_idx" ON "quiz_attempts" USING btree ("tenant_id","quiz_path","started_at");CREATE UNIQUE INDEX "quiz_attempts_contact_idx" ON "quiz_attempts" USING btree ("tenant_id","quiz_path","contact") WHERE "quiz_attempts"."contact" is not null;-- Same lock-down as 0001: only the app's own connection can read or write quiz attempts.
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;REVOKE ALL ON "quiz_attempts" FROM anon, authenticated;
