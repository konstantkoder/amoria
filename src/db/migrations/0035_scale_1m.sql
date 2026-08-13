-- Scale hot-path indexes. For an already large production database, create these
-- indexes CONCURRENTLY in a staged pre-deploy operation; see docs/scale_1m_architecture.md.
ALTER TABLE "users" ADD COLUMN "auth_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_auth_version_check" CHECK ("auth_version" >= 0) NOT VALID;
ALTER TABLE "users" VALIDATE CONSTRAINT "users_auth_version_check";
ALTER TABLE "refresh_tokens" ADD COLUMN "auth_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_auth_version_check" CHECK ("auth_version" >= 0) NOT VALID;
ALTER TABLE "refresh_tokens" VALIDATE CONSTRAINT "refresh_tokens_auth_version_check";

CREATE INDEX IF NOT EXISTS "messages_thread_created_id_idx" ON "messages" ("thread_id", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "messages_thread_sender_created_idx" ON "messages" ("thread_id", "from_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "thread_members_user_thread_idx" ON "thread_members" ("user_id", "thread_id");
CREATE INDEX IF NOT EXISTS "together_queue_waiting_activity_created_idx" ON "together_queue" ("activity", "created_at", "id") WHERE "status" = 'waiting';
CREATE INDEX IF NOT EXISTS "together_queue_status_expires_idx" ON "together_queue" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "together_events_session_created_id_idx" ON "together_events" ("session_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "together_session_members_user_session_idx" ON "together_session_members" ("user_id", "session_id");
CREATE INDEX IF NOT EXISTS "nearby_profile_visibility_active_geo_idx" ON "nearby_profile_visibility" ("latitude", "longitude", "expires_at") WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "nearby_statuses_geo_expires_idx" ON "nearby_statuses" ("lat", "lng", "expires_at");
CREATE INDEX IF NOT EXISTS "push_deliveries_status_updated_idx" ON "push_deliveries" ("status", "updated_at");
