CREATE TABLE "analytics_daily" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"key" text DEFAULT '' NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_daily_tenant_id_day_metric_key_pk" PRIMARY KEY("tenant_id","day","metric","key")
);
--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write analytics.
ALTER TABLE "analytics_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "analytics_daily" FROM anon, authenticated;
