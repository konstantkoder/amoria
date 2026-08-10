ALTER TABLE "users" ADD COLUMN "account_status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "suspension_reason" text;
ALTER TABLE "users" ADD COLUMN "suspended_by_admin_user_id" uuid;
ALTER TABLE "users" ADD CONSTRAINT "users_account_status_check" CHECK ("users"."account_status" IN ('active', 'suspended'));
ALTER TABLE "users" ADD CONSTRAINT "users_suspended_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("suspended_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "users_account_status_idx" ON "users" USING btree ("account_status");

ALTER TABLE "safety_reports" ADD COLUMN "assigned_admin_user_id" uuid;
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_assigned_admin_user_id_admin_users_id_fk" FOREIGN KEY ("assigned_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "safety_reports_assigned_admin_user_id_idx" ON "safety_reports" USING btree ("assigned_admin_user_id");

ALTER TABLE "media_files" ADD COLUMN "physically_purged_at" timestamp with time zone;
ALTER TABLE "media_files" ADD COLUMN "physically_purged_by_admin_user_id" uuid;
ALTER TABLE "media_files" ADD COLUMN "physical_purge_reason" text;
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_physically_purged_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("physically_purged_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "admin_bulk_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid,
  "kind" text NOT NULL,
  "action" text NOT NULL,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reason" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "max_items" integer NOT NULL,
  "status" text DEFAULT 'awaiting_confirmation' NOT NULL,
  "confirmation_token_hash" text NOT NULL,
  "confirmed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "preview_count" integer DEFAULT 0 NOT NULL,
  "applied_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_bulk_jobs_kind_check" CHECK ("admin_bulk_jobs"."kind" IN ('media_scan', 'media_decision', 'message_decision', 'physical_media_purge')),
  CONSTRAINT "admin_bulk_jobs_status_check" CHECK ("admin_bulk_jobs"."status" IN ('awaiting_confirmation', 'running', 'completed', 'partially_failed', 'cancelled')),
  CONSTRAINT "admin_bulk_jobs_max_items_check" CHECK ("admin_bulk_jobs"."max_items" >= 1 AND "admin_bulk_jobs"."max_items" <= 100)
);
ALTER TABLE "admin_bulk_jobs" ADD CONSTRAINT "admin_bulk_jobs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "admin_bulk_jobs_admin_idempotency_unique" ON "admin_bulk_jobs" USING btree ("admin_user_id", "idempotency_key");
CREATE INDEX "admin_bulk_jobs_created_at_idx" ON "admin_bulk_jobs" USING btree ("created_at");

CREATE TABLE "admin_bulk_job_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "proposed_action" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_code" text,
  "metadata" jsonb,
  "applied_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_bulk_job_items_status_check" CHECK ("admin_bulk_job_items"."status" IN ('pending', 'applied', 'skipped', 'failed'))
);
ALTER TABLE "admin_bulk_job_items" ADD CONSTRAINT "admin_bulk_job_items_job_id_admin_bulk_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."admin_bulk_jobs"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "admin_bulk_job_items_job_target_unique" ON "admin_bulk_job_items" USING btree ("job_id", "target_type", "target_id");
CREATE INDEX "admin_bulk_job_items_job_status_idx" ON "admin_bulk_job_items" USING btree ("job_id", "status");
