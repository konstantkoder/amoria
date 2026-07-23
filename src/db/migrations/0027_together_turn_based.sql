ALTER TABLE "together_sessions" ADD COLUMN "mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD COLUMN "artifact_purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD COLUMN "artifact_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD COLUMN "event_count_snapshot" integer;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD CONSTRAINT "together_sessions_mode_check" CHECK ("mode" IN ('live','turn_based'));--> statement-breakpoint
CREATE TABLE "together_turn_based_moments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" text NOT NULL,
  "stage" text NOT NULL,
  "starter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "partner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "draw_session_id" uuid NOT NULL UNIQUE REFERENCES "together_sessions"("id") ON DELETE CASCADE,
  "story_session_id" uuid UNIQUE REFERENCES "together_sessions"("id") ON DELETE SET NULL,
  "current_turn_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "current_round_id" text,
  "current_round_index" integer,
  "current_round_choice_index" integer,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "radius_km" integer,
  "starter_age" integer NOT NULL,
  "preferred_age_min" integer NOT NULL,
  "preferred_age_max" integer,
  "starter_gender" text NOT NULL,
  "preferred_genders" jsonb NOT NULL,
  "starter_submitted_at" timestamp with time zone,
  "partner_claimed_at" timestamp with time zone,
  "claim_expires_at" timestamp with time zone,
  "stage_completed_at" timestamp with time zone,
  "decision_expires_at" timestamp with time zone,
  "waiting_expires_at" timestamp with time zone,
  "turn_expires_at" timestamp with time zone,
  "artifact_purge_after" timestamp with time zone,
  "artifact_purged_at" timestamp with time zone,
  "last_transition" text NOT NULL,
  "last_transition_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cancel_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "together_turn_based_moments_status_check" CHECK ("status" IN ('starter_turn','waiting_for_partner','partner_turn','awaiting_draw_reveal','story_turn','awaiting_story_reveal','completed','expired','cancelled','blocked','reported')),
  CONSTRAINT "together_turn_based_moments_stage_check" CHECK ("stage" IN ('draw','story','done')),
  CONSTRAINT "together_turn_based_moments_radius_check" CHECK ("radius_km" IS NULL OR "radius_km" IN (5,25,100,250))
);--> statement-breakpoint
CREATE INDEX "together_turn_based_moments_status_created_idx" ON "together_turn_based_moments" ("status","created_at");--> statement-breakpoint
CREATE INDEX "together_turn_based_moments_partner_idx" ON "together_turn_based_moments" ("partner_user_id");--> statement-breakpoint
CREATE TABLE "together_turn_based_participants" (
  "moment_id" uuid NOT NULL REFERENCES "together_turn_based_moments"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "together_turn_based_participants_moment_user_pk" PRIMARY KEY ("moment_id","user_id"),
  CONSTRAINT "together_turn_based_participants_role_check" CHECK ("role" IN ('starter','partner'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "together_turn_based_participants_role_unique" ON "together_turn_based_participants" ("moment_id","role") WHERE "active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "together_turn_based_participants_active_user_unique" ON "together_turn_based_participants" ("user_id") WHERE "active" = true;--> statement-breakpoint
CREATE TABLE "together_turn_based_problems" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "moment_id" uuid REFERENCES "together_turn_based_moments"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "severity" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "summary" text NOT NULL,
  "details" jsonb,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "occurrence_count" integer DEFAULT 1 NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by_admin_user_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "resolution_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "together_turn_based_problems_severity_check" CHECK ("severity" IN ('info','warning','error','critical')),
  CONSTRAINT "together_turn_based_problems_status_check" CHECK ("status" IN ('open','resolved','ignored'))
);--> statement-breakpoint
CREATE INDEX "together_turn_based_problems_status_seen_idx" ON "together_turn_based_problems" ("status","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "together_turn_based_problems_open_dedupe" ON "together_turn_based_problems" ("moment_id","code") WHERE "status" = 'open';
