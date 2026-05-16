ALTER TABLE "safety_reports" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "safety_reports" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_status_check" CHECK ("status" IN ('open', 'under_review', 'resolved', 'dismissed', 'escalated'));
--> statement-breakpoint
CREATE INDEX "safety_reports_status_created_at_idx" ON "safety_reports" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "safety_reports_target_type_idx" ON "safety_reports" USING btree ("target_type");
--> statement-breakpoint
CREATE INDEX "safety_reports_reporter_idx" ON "safety_reports" USING btree ("reporter_user_id");
--> statement-breakpoint
CREATE INDEX "safety_reports_target_owner_idx" ON "safety_reports" USING btree ("target_owner_user_id");
--> statement-breakpoint
CREATE TABLE "report_review_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "admin_user_id" uuid,
  "action" text NOT NULL,
  "reason" text,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_review_actions_action_check" CHECK ("action" IN ('assign', 'mark_under_review', 'dismiss', 'resolve', 'escalate', 'add_note'))
);
--> statement-breakpoint
CREATE TABLE "media_moderation_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_id" uuid NOT NULL,
  "owner_user_id" uuid,
  "admin_user_id" uuid,
  "action" text NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "media_moderation_reviews_action_check" CHECK ("action" IN ('approve', 'restrict', 'remove', 'mark_under_review'))
);
--> statement-breakpoint
ALTER TABLE "report_review_actions" ADD CONSTRAINT "report_review_actions_report_id_safety_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."safety_reports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_review_actions" ADD CONSTRAINT "report_review_actions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_moderation_reviews" ADD CONSTRAINT "media_moderation_reviews_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_moderation_reviews" ADD CONSTRAINT "media_moderation_reviews_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "media_moderation_reviews" ADD CONSTRAINT "media_moderation_reviews_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "report_review_actions_report_created_at_idx" ON "report_review_actions" USING btree ("report_id","created_at");
--> statement-breakpoint
CREATE INDEX "report_review_actions_admin_user_idx" ON "report_review_actions" USING btree ("admin_user_id");
--> statement-breakpoint
CREATE INDEX "media_moderation_reviews_media_created_at_idx" ON "media_moderation_reviews" USING btree ("media_id","created_at");
--> statement-breakpoint
CREATE INDEX "media_moderation_reviews_owner_idx" ON "media_moderation_reviews" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "media_moderation_reviews_admin_user_idx" ON "media_moderation_reviews" USING btree ("admin_user_id");
