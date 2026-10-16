-- Referral partners (content.referrals): the partner code a request or quiz attempt came through.
ALTER TABLE "quiz_attempts" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "ref" text;
