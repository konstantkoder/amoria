ALTER TABLE "together_turn_based_moments" ADD COLUMN "client_request_id" text;--> statement-breakpoint
ALTER TABLE "together_turn_based_moments" ADD CONSTRAINT "together_turn_based_moments_client_request_id_length_check" CHECK ("client_request_id" IS NULL OR char_length("client_request_id") BETWEEN 1 AND 128);--> statement-breakpoint
CREATE UNIQUE INDEX "together_turn_based_moments_start_request_unique" ON "together_turn_based_moments" ("starter_user_id","client_request_id") WHERE "client_request_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "together_turn_based_participants" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "together_turn_based_problems" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "together_turn_based_problems" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "together_turn_based_problems" ADD CONSTRAINT "together_turn_based_problems_session_id_together_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."together_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_turn_based_problems" ADD CONSTRAINT "together_turn_based_problems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "together_turn_based_problems_session_idx" ON "together_turn_based_problems" ("session_id");--> statement-breakpoint
CREATE INDEX "together_turn_based_problems_user_idx" ON "together_turn_based_problems" ("user_id");--> statement-breakpoint
DROP INDEX "together_turn_based_problems_open_dedupe";--> statement-breakpoint
CREATE UNIQUE INDEX "together_turn_based_problems_open_dedupe" ON "together_turn_based_problems" (COALESCE("moment_id"::text,'global'),"code") WHERE "status" = 'open';
