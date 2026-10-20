ALTER TABLE "admin_users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every partner so far got their password from the super admin: they pick their own at the next login.
UPDATE "partners" SET "must_change_password" = true;
