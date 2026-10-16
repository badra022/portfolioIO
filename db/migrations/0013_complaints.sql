-- Anonymous complaints box (content.complaints): no name, phone, device or time of day.
CREATE TABLE "complaints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"env" text DEFAULT 'production' NOT NULL,
	"day" date NOT NULL,
	"topic" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaints_tenant_idx" ON "complaints" USING btree ("tenant_id","env","day");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write complaints.
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "complaints" FROM anon, authenticated;
