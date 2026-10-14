-- Student profiles (lib/server/students.ts): one per phone number, built from requests, quizzes and exam results.
CREATE TABLE "student_sync" (
	"tenant_id" uuid NOT NULL,
	"env" text NOT NULL,
	"last_submission" bigint DEFAULT 0 NOT NULL,
	"last_attempt" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "student_sync_tenant_id_env_pk" PRIMARY KEY("tenant_id","env")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"env" text DEFAULT 'production' NOT NULL,
	"phone_key" text NOT NULL,
	"phone" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"name_by_teacher" boolean DEFAULT false NOT NULL,
	"traits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "student_id" bigint;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "student_id" bigint;--> statement-breakpoint
ALTER TABLE "student_sync" ADD CONSTRAINT "student_sync_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "students_phone_idx" ON "students" USING btree ("tenant_id","env","phone_key");--> statement-breakpoint
CREATE INDEX "submissions_student_idx" ON "submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_student_idx" ON "quiz_attempts" USING btree ("student_id");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write them.
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "students" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "student_sync" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "student_sync" FROM anon, authenticated;--> statement-breakpoint
-- Teachers who had every bundle keep having every bundle (lib/permissions.ts "students").
UPDATE "tenants" SET "permissions" = "permissions" || '{"students": true}'::jsonb WHERE ("permissions"->>'forms')::boolean IS TRUE;
