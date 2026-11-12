CREATE TABLE "mcp_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"scope" text NOT NULL,
	"slug" text,
	"tool" text NOT NULL,
	"ms" integer NOT NULL,
	"bytes" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "mcp_calls_at_idx" ON "mcp_calls" USING btree ("at");--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write these.
ALTER TABLE "mcp_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "mcp_calls" FROM anon, authenticated;
