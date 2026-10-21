CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"role" text DEFAULT 'teacher' NOT NULL,
	"subject" text,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"visitor" text
);
--> statement-breakpoint
CREATE INDEX "contact_requests_created_idx" ON "contact_requests" USING btree ("created_at");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write these.
ALTER TABLE "contact_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "contact_requests" FROM anon, authenticated;
