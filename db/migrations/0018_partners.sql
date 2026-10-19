CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"trial_hours" integer DEFAULT 72 NOT NULL,
	"form" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "partners_slug_unique" UNIQUE("slug"),
	CONSTRAINT "partners_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "platform_daily" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_daily" DROP CONSTRAINT "platform_daily_day_metric_key_pk";--> statement-breakpoint
ALTER TABLE "platform_daily" ADD CONSTRAINT "platform_daily_day_source_metric_key_pk" PRIMARY KEY("day","source","metric","key");--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "trial_requests" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "trial_requests" ADD COLUMN "extra" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_requests" ADD CONSTRAINT "trial_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenants_partner_idx" ON "tenants" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "trial_requests_partner_idx" ON "trial_requests" USING btree ("partner_id");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write these.
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "partners" FROM anon, authenticated;
