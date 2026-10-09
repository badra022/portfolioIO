CREATE TABLE "tenant_files" (
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "tenant_files_tenant_id_name_pk" PRIMARY KEY("tenant_id","name")
);
--> statement-breakpoint
ALTER TABLE "tenant_files" ADD CONSTRAINT "tenant_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write site files.
ALTER TABLE "tenant_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "tenant_files" FROM anon, authenticated;
