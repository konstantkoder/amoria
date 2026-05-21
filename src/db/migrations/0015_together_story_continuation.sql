ALTER TABLE "together_sessions" ADD COLUMN "source_session_id" uuid;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD CONSTRAINT "together_sessions_source_session_id_together_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."together_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "together_story_sparks_source_unique" ON "together_sessions" USING btree ("source_session_id") WHERE "together_sessions"."activity" = 'story_sparks' AND "together_sessions"."source_session_id" IS NOT NULL;
