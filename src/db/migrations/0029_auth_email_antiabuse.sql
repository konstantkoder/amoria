ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;--> statement-breakpoint

CREATE TABLE "auth_email_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_email_challenges_purpose_check" CHECK ("purpose" IN ('verify_email', 'password_reset')),
  CONSTRAINT "auth_email_challenges_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" > 0 AND "attempt_count" <= "max_attempts")
);--> statement-breakpoint
ALTER TABLE "auth_email_challenges" ADD CONSTRAINT "auth_email_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_email_challenges_active_user_purpose_unique" ON "auth_email_challenges" ("user_id", "purpose") WHERE "consumed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "auth_email_challenges_expiry_idx" ON "auth_email_challenges" ("expires_at");--> statement-breakpoint

CREATE TABLE "auth_rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" text NOT NULL,
  "key_hash" text NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "blocked_until" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auth_rate_limits_scope_key_unique" UNIQUE("scope", "key_hash"),
  CONSTRAINT "auth_rate_limits_attempt_count_check" CHECK ("attempt_count" >= 0)
);--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expiry_idx" ON "auth_rate_limits" ("expires_at");
