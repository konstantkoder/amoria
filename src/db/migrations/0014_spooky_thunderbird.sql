ALTER TABLE "client_error_reports" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD COLUMN "resolved_by_admin_user_id" uuid;--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD CONSTRAINT "client_error_reports_resolved_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD CONSTRAINT "client_error_reports_status_check" CHECK ("status" IN ('open', 'resolved', 'ignored', 'archived'));--> statement-breakpoint
CREATE INDEX "client_error_reports_status_created_at_idx" ON "client_error_reports" USING btree ("status","created_at");
