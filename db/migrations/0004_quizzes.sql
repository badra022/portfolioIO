CREATE TABLE "quiz_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quiz_path" text NOT NULL,
	"token" text NOT NULL,
	"contact" text,
	"fields" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "quiz_attempts_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_idx" ON "quiz_attempts" USING btree ("tenant_id","quiz_path","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_contact_idx" ON "quiz_attempts" USING btree ("tenant_id","quiz_path","contact") WHERE "quiz_attempts"."contact" is not null;--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write quiz attempts.
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "quiz_attempts" FROM anon, authenticated;
