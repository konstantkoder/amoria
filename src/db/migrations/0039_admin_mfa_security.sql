ALTER TABLE "admin_users" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_session_version_check" CHECK ("session_version" >= 0);--> statement-breakpoint

CREATE TABLE "admin_mfa_credentials" (
  "admin_user_id" uuid PRIMARY KEY NOT NULL,
  "secret_ciphertext" text NOT NULL,
  "secret_iv" text NOT NULL,
  "secret_auth_tag" text NOT NULL,
  "key_version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_accepted_counter" bigint,
  "enabled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_mfa_credentials_status_check" CHECK ("status" IN ('pending', 'enabled')),
  CONSTRAINT "admin_mfa_credentials_counter_check" CHECK ("last_accepted_counter" IS NULL OR "last_accepted_counter" >= 0),
  CONSTRAINT "admin_mfa_credentials_enabled_check" CHECK (("status" = 'enabled' AND "enabled_at" IS NOT NULL) OR ("status" = 'pending' AND "enabled_at" IS NULL))
);--> statement-breakpoint
ALTER TABLE "admin_mfa_credentials" ADD CONSTRAINT "admin_mfa_credentials_admin_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "admin_mfa_pre_auth_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "flow" text NOT NULL,
  "ip_hash" text,
  "user_agent_hash" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_mfa_pre_auth_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "admin_mfa_pre_auth_flow_check" CHECK ("flow" IN ('enroll', 'verify')),
  CONSTRAINT "admin_mfa_pre_auth_attempts_check" CHECK ("attempt_count" >= 0 AND "max_attempts" > 0 AND "attempt_count" <= "max_attempts")
);--> statement-breakpoint
ALTER TABLE "admin_mfa_pre_auth_challenges" ADD CONSTRAINT "admin_mfa_pre_auth_admin_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_mfa_pre_auth_admin_expiry_idx" ON "admin_mfa_pre_auth_challenges" ("admin_user_id", "expires_at");--> statement-breakpoint
CREATE INDEX "admin_mfa_pre_auth_expiry_idx" ON "admin_mfa_pre_auth_challenges" ("expires_at");--> statement-breakpoint

CREATE TABLE "admin_mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "generation_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_mfa_recovery_code_hash_unique" UNIQUE("admin_user_id", "code_hash")
);--> statement-breakpoint
ALTER TABLE "admin_mfa_recovery_codes" ADD CONSTRAINT "admin_mfa_recovery_admin_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_mfa_recovery_admin_unused_idx" ON "admin_mfa_recovery_codes" ("admin_user_id", "used_at");--> statement-breakpoint

CREATE TABLE "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family_id" uuid NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "admin_session_version" integer NOT NULL,
  "user_auth_version" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "replaced_by_session_id" uuid,
  "device_id" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "admin_sessions_versions_check" CHECK ("admin_session_version" >= 0 AND "user_auth_version" >= 0)
);--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_replaced_by_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "public"."admin_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_active_idx" ON "admin_sessions" ("admin_user_id", "expires_at") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "admin_sessions_family_idx" ON "admin_sessions" ("family_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions" ("expires_at");--> statement-breakpoint

CREATE TABLE "admin_step_up_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "admin_session_version" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_step_up_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "admin_step_up_version_check" CHECK ("admin_session_version" >= 0)
);--> statement-breakpoint
ALTER TABLE "admin_step_up_sessions" ADD CONSTRAINT "admin_step_up_admin_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_step_up_admin_expiry_idx" ON "admin_step_up_sessions" ("admin_user_id", "expires_at") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "admin_step_up_expiry_idx" ON "admin_step_up_sessions" ("expires_at");
