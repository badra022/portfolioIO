-- Anonymous votes (content.polls): one count per choice, nothing about who voted.
CREATE TABLE "poll_votes" (
	"tenant_id" uuid NOT NULL,
	"env" text DEFAULT 'production' NOT NULL,
	"poll_path" text NOT NULL,
	"choice" integer NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "poll_votes_tenant_id_env_poll_path_choice_pk" PRIMARY KEY("tenant_id","env","poll_path","choice")
);
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same lock-down as 0001: only the app's own connection can read or write votes.
ALTER TABLE "poll_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "poll_votes" FROM anon, authenticated;
