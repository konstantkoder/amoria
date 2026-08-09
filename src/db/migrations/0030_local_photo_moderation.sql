ALTER TABLE "media_files" ADD COLUMN "moderation_state" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "moderation_origin" text DEFAULT 'legacy_pre_moderation' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "automated_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "moderation_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_moderation_state_check" CHECK ("moderation_state" IN ('pending', 'approved', 'needs_review', 'restricted', 'removed'));--> statement-breakpoint
CREATE INDEX "media_files_moderation_state_created_at_idx" ON "media_files" ("moderation_state", "created_at");--> statement-breakpoint

UPDATE "media_files"
SET
  "moderation_state" = 'approved',
  "moderation_origin" = 'legacy_pre_moderation',
  "moderation_updated_at" = "created_at";--> statement-breakpoint

ALTER TABLE "media_files" ALTER COLUMN "moderation_state" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "media_files" ALTER COLUMN "moderation_origin" SET DEFAULT 'unclassified';--> statement-breakpoint

CREATE TABLE "media_moderation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "provider_engine" text NOT NULL,
  "model_version" text NOT NULL,
  "policy_version" text NOT NULL,
  "error_code" text,
  "raw_result" jsonb,
  "policy_decision" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_moderation_jobs_status_check" CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "media_moderation_jobs_attempt_count_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "media_moderation_jobs_policy_decision_check" CHECK ("policy_decision" IS NULL OR "policy_decision" IN ('approve', 'needs_review', 'restrict'))
);--> statement-breakpoint
ALTER TABLE "media_moderation_jobs" ADD CONSTRAINT "media_moderation_jobs_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_moderation_jobs_claim_idx" ON "media_moderation_jobs" ("status", "next_attempt_at", "created_at");--> statement-breakpoint
CREATE INDEX "media_moderation_jobs_media_created_at_idx" ON "media_moderation_jobs" ("media_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_moderation_jobs_one_active_per_media_idx" ON "media_moderation_jobs" ("media_id") WHERE "status" IN ('queued', 'running');
