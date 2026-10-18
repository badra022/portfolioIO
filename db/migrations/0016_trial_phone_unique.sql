DROP INDEX IF EXISTS "tenants_signup_phone_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_signup_phone_key" ON "tenants" USING btree ("signup_phone");