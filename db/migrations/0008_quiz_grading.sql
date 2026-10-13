-- Grading online quizzes: the teacher's grade on each attempt, and the quiz's own exam results (approved grades are looked up there).
ALTER TABLE "exam_results" ADD COLUMN "quiz_path" text;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "result" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_results_quiz_idx" ON "exam_results" USING btree ("tenant_id","quiz_path") WHERE "exam_results"."quiz_path" is not null;