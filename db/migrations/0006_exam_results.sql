CREATE TABLE "exam_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" text,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"total" text,
	"published" boolean DEFAULT false NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"lookups" integer DEFAULT 0 NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_results_tenant_idx" ON "exam_results" USING btree ("tenant_id","date");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write exam results.
ALTER TABLE "exam_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "exam_results" FROM anon, authenticated;
