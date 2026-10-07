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
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_tenant_created_idx" ON "submissions" USING btree ("tenant_id","created_at");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write submissions (they hold phone numbers).
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "submissions" FROM anon, authenticated;
