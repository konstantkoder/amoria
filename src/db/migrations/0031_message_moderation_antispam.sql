CREATE TABLE "message_moderation_states" (
  "message_id" uuid PRIMARY KEY NOT NULL,
  "state" text DEFAULT 'visible' NOT NULL,
  "source" text NOT NULL,
  "automation_status" text DEFAULT 'not_required' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_moderation_states_state_check" CHECK ("state" IN ('visible', 'held', 'needs_review', 'restricted', 'removed')),
  CONSTRAINT "message_moderation_states_source_check" CHECK ("source" IN ('direct', 'nearby')),
  CONSTRAINT "message_moderation_states_automation_status_check" CHECK ("automation_status" IN ('completed', 'failed', 'not_configured', 'not_required'))
);--> statement-breakpoint
ALTER TABLE "message_moderation_states" ADD CONSTRAINT "message_moderation_states_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_moderation_states_state_updated_at_idx" ON "message_moderation_states" ("state", "updated_at");--> statement-breakpoint

CREATE TABLE "message_moderation_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "source" text NOT NULL,
  "action" text NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "admin_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_moderation_reviews_source_check" CHECK ("source" IN ('legacy', 'automated_spam', 'automated_local_model', 'user_report', 'manual_admin')),
  CONSTRAINT "message_moderation_reviews_action_check" CHECK ("action" IN ('allow', 'flag', 'hold', 'approve', 'restrict', 'remove', 'restore', 'escalate'))
);--> statement-breakpoint
ALTER TABLE "message_moderation_reviews" ADD CONSTRAINT "message_moderation_reviews_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_moderation_reviews" ADD CONSTRAINT "message_moderation_reviews_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_moderation_reviews_message_created_at_idx" ON "message_moderation_reviews" ("message_id", "created_at");--> statement-breakpoint
CREATE INDEX "message_moderation_reviews_source_created_at_idx" ON "message_moderation_reviews" ("source", "created_at");--> statement-breakpoint

CREATE TABLE "message_abuse_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sender_user_id" uuid NOT NULL,
  "thread_key" text NOT NULL,
  "recipient_key" text,
  "client_message_id" text NOT NULL,
  "exact_fingerprint" text NOT NULL,
  "similarity_hash" text NOT NULL,
  "link_fingerprint" text,
  "url_count" integer DEFAULT 0 NOT NULL,
  "decision" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "message_abuse_events_sender_thread_client_unique" UNIQUE("sender_user_id", "thread_key", "client_message_id"),
  CONSTRAINT "message_abuse_events_decision_check" CHECK ("decision" IN ('allow', 'hold', 'rate_limit')),
  CONSTRAINT "message_abuse_events_url_count_check" CHECK ("url_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "message_abuse_events" ADD CONSTRAINT "message_abuse_events_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_abuse_events_sender_created_at_idx" ON "message_abuse_events" ("sender_user_id", "created_at");--> statement-breakpoint
CREATE INDEX "message_abuse_events_expires_at_idx" ON "message_abuse_events" ("expires_at");--> statement-breakpoint

INSERT INTO "message_moderation_states" ("message_id", "state", "source", "automation_status", "updated_at")
SELECT m."id", 'visible', CASE WHEN t."type" = 'nearby_room' THEN 'nearby' ELSE 'direct' END,
       'not_required', m."created_at"
FROM "messages" m
JOIN "threads" t ON t."id" = m."thread_id"
ON CONFLICT ("message_id") DO NOTHING;--> statement-breakpoint

INSERT INTO "message_moderation_reviews" ("message_id", "source", "action", "reason", "metadata", "created_at")
SELECT m."id", 'legacy', 'allow', 'legacy_pre_moderation',
       jsonb_build_object('policyVersion', 'legacy_pre_moderation'), m."created_at"
FROM "messages" m
WHERE NOT EXISTS (
  SELECT 1 FROM "message_moderation_reviews" r WHERE r."message_id" = m."id"
);
