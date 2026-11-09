CREATE TABLE "game_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"html" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "game_files" ADD CONSTRAINT "game_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_files_tenant_idx" ON "game_files" USING btree ("tenant_id");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write these.
ALTER TABLE "game_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "game_files" FROM anon, authenticated;
