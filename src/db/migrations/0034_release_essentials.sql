ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "users" DROP CONSTRAINT "users_account_status_check";
ALTER TABLE "users" ADD CONSTRAINT "users_account_status_check"
  CHECK ("account_status" IN ('active', 'suspended', 'deleting', 'deleted'));

ALTER TABLE "safety_reports" ALTER COLUMN "reporter_user_id" DROP NOT NULL;
ALTER TABLE "safety_reports" DROP CONSTRAINT "safety_reports_reporter_user_id_users_id_fk";
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_user_id_users_id_fk"
  FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

CREATE TABLE "account_deletion_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "object_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "deleted_object_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error_code" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_deletion_jobs_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "account_deletion_jobs_status_check" CHECK ("status" IN ('pending', 'processing', 'retry', 'completed')),
  CONSTRAINT "account_deletion_jobs_attempt_count_check" CHECK ("attempt_count" >= 0)
);
CREATE INDEX "account_deletion_jobs_due_idx" ON "account_deletion_jobs" USING btree ("status", "next_attempt_at");

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title_key" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "event_key" text NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_user_event_unique" UNIQUE("user_id", "event_key"),
  CONSTRAINT "notifications_type_check" CHECK ("type" IN ('direct_message', 'together_match', 'together_action', 'announcement'))
);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id", "created_at");
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id", "read_at");

CREATE TABLE "push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "platform" text NOT NULL,
  "device_id" text NOT NULL,
  "disabled_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "push_tokens_token_unique" UNIQUE("token"),
  CONSTRAINT "push_tokens_user_device_unique" UNIQUE("user_id", "device_id"),
  CONSTRAINT "push_tokens_platform_check" CHECK ("platform" IN ('android', 'ios'))
);
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "push_tokens_user_active_idx" ON "push_tokens" USING btree ("user_id", "disabled_at");

CREATE TABLE "push_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL,
  "push_token_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expo_receipt_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "push_deliveries_notification_token_unique" UNIQUE("notification_id", "push_token_id"),
  CONSTRAINT "push_deliveries_status_check" CHECK ("status" IN ('pending', 'sending', 'receipt_pending', 'retry', 'delivered', 'failed')),
  CONSTRAINT "push_deliveries_attempt_count_check" CHECK ("attempt_count" >= 0)
);
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_notifications_id_fk"
  FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_push_token_id_push_tokens_id_fk"
  FOREIGN KEY ("push_token_id") REFERENCES "public"."push_tokens"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "push_deliveries_due_idx" ON "push_deliveries" USING btree ("status", "next_attempt_at");
CREATE INDEX "push_deliveries_receipt_idx" ON "push_deliveries" USING btree ("expo_receipt_id");
