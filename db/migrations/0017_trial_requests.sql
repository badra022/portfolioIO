CREATE TABLE "platform_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "platform_daily_day_metric_key_pk" PRIMARY KEY("day","metric","key")
);
--> statement-breakpoint
CREATE TABLE "trial_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"subject" text,
	"phone" text,
	"locale" text,
	"username" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "trial_requests" ADD CONSTRAINT "trial_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_requests_created_idx" ON "trial_requests" USING btree ("created_at");--> statement-breakpoint
-- Trial sites made before this table existed become leads too.
INSERT INTO "trial_requests" ("created_at", "tenant_id", "slug", "name", "phone", "locale", "username")
SELECT t."created_at", t."id", t."slug", t."name", t."signup_phone", t."content"->>'locale',
  (SELECT u."username" FROM "admin_users" u WHERE u."tenant_id" = t."id" ORDER BY u."created_at" LIMIT 1)
FROM "tenants" t WHERE t."signup_key" IS NOT NULL;--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write these.
ALTER TABLE "trial_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "trial_requests" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "platform_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "platform_daily" FROM anon, authenticated;
