-- What each teacher's plan includes (lib/permissions.ts). New teachers start with nothing; teachers from before this change keep everything.
ALTER TABLE "tenants" ADD COLUMN "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "tenants" SET "permissions" = '{"analytics": true, "forms": true, "exams": true, "votes": true, "promo": true}'::jsonb;
