CREATE TABLE "signup_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"visitor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "signup_phone" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "signup_otps_phone_idx" ON "signup_otps" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "signup_otps_visitor_idx" ON "signup_otps" USING btree ("visitor","created_at");--> statement-breakpoint
CREATE INDEX "tenants_signup_phone_idx" ON "tenants" USING btree ("signup_phone");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write sign-up codes.
ALTER TABLE "signup_otps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "signup_otps" FROM anon, authenticated;
