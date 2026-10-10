-- Preview environment (lib/environments.ts): a private preview copy of each teacher's content,
-- and an "env" on everything the site collects, so testing in preview stays out of the real numbers.
DROP INDEX "quiz_attempts_contact_idx";--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD COLUMN "env" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_daily" DROP CONSTRAINT "analytics_daily_tenant_id_day_metric_key_pk";--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_tenant_id_env_day_metric_key_pk" PRIMARY KEY("tenant_id","env","day","metric","key");--> statement-breakpoint
ALTER TABLE "exam_results" ADD COLUMN "preview_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_results" ADD COLUMN "preview_lookups" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_results" ADD COLUMN "preview_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "env" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "env" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_revisions" ADD COLUMN "env" text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "preview_content" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "preview_theme" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "preview_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "preview_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "preview_updated_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_contact_idx" ON "quiz_attempts" USING btree ("tenant_id","env","quiz_path","contact") WHERE "quiz_attempts"."contact" is not null;