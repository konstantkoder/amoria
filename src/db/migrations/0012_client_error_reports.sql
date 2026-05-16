CREATE TABLE "client_error_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "amoria_id" text,
  "display_name" text,
  "email" text,
  "screen" text NOT NULL,
  "action" text NOT NULL,
  "step" text,
  "code" text,
  "message" text NOT NULL,
  "stack" text,
  "metadata" jsonb,
  "platform" text,
  "app_version" text,
  "build_number" text,
  "device_model" text,
  "os_version" text,
  "request_id" text,
  "backend_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_error_reports" ADD CONSTRAINT "client_error_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "client_error_reports_created_at_idx" ON "client_error_reports" USING btree ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX "client_error_reports_user_id_idx" ON "client_error_reports" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "client_error_reports_amoria_id_idx" ON "client_error_reports" USING btree ("amoria_id");
--> statement-breakpoint
CREATE INDEX "client_error_reports_screen_idx" ON "client_error_reports" USING btree ("screen");
--> statement-breakpoint
CREATE INDEX "client_error_reports_action_idx" ON "client_error_reports" USING btree ("action");
--> statement-breakpoint
CREATE INDEX "client_error_reports_code_idx" ON "client_error_reports" USING btree ("code");
