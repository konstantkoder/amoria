CREATE TABLE "monetization_settings" (
  "id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
  "mode" text DEFAULT 'OFF' NOT NULL,
  "first_monetization_enabled_at" timestamp with time zone,
  "founder_campaign_status" text DEFAULT 'ACTIVE' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by_admin_user_id" uuid,
  CONSTRAINT "monetization_settings_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "monetization_settings_mode_check" CHECK ("mode" IN ('OFF', 'TEST', 'ON', 'PAUSED')),
  CONSTRAINT "monetization_settings_founder_campaign_check" CHECK ("founder_campaign_status" IN ('ACTIVE', 'PAUSED'))
);--> statement-breakpoint
ALTER TABLE "monetization_settings" ADD CONSTRAINT "monetization_settings_admin_fk" FOREIGN KEY ("updated_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "monetization_settings" ("id", "mode", "founder_campaign_status") VALUES (1, 'OFF', 'ACTIVE') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

CREATE TABLE "founders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL,
  "founder_number" integer,
  "reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reservation_expires_at" timestamp with time zone NOT NULL,
  "activated_at" timestamp with time zone,
  "premium_starts_at" timestamp with time zone,
  "premium_ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "founders_user_unique" UNIQUE("user_id"),
  CONSTRAINT "founders_number_unique" UNIQUE("founder_number"),
  CONSTRAINT "founders_status_check" CHECK ("status" IN ('reserved', 'activated', 'expired')),
  CONSTRAINT "founders_number_range_check" CHECK ("founder_number" IS NULL OR ("founder_number" >= 1 AND "founder_number" <= 500)),
  CONSTRAINT "founders_activation_shape_check" CHECK (("status" = 'activated' AND "founder_number" IS NOT NULL AND "activated_at" IS NOT NULL) OR ("status" <> 'activated' AND "founder_number" IS NULL AND "activated_at" IS NULL)),
  CONSTRAINT "founders_premium_window_check" CHECK (("premium_starts_at" IS NULL AND "premium_ends_at" IS NULL) OR ("premium_starts_at" IS NOT NULL AND "premium_ends_at" IS NOT NULL AND "premium_ends_at" > "premium_starts_at"))
);--> statement-breakpoint
ALTER TABLE "founders" ADD CONSTRAINT "founders_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "founders_status_reservation_idx" ON "founders" ("status", "reservation_expires_at");--> statement-breakpoint
CREATE INDEX "founders_premium_end_idx" ON "founders" ("premium_ends_at") WHERE "status" = 'activated';--> statement-breakpoint

CREATE TABLE "premium_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "source" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "source_reference" text NOT NULL,
  "store" text,
  "product_id" text,
  "verification_status" text DEFAULT 'verified' NOT NULL,
  "verified_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "premium_entitlements_source_reference_unique" UNIQUE("source", "source_reference"),
  CONSTRAINT "premium_entitlements_source_check" CHECK ("source" IN ('founder', 'google_play', 'admin_grant')),
  CONSTRAINT "premium_entitlements_status_check" CHECK ("status" IN ('active', 'expired', 'revoked', 'billing_issue')),
  CONSTRAINT "premium_entitlements_verification_check" CHECK ("verification_status" IN ('pending', 'verified', 'invalid', 'revoked')),
  CONSTRAINT "premium_entitlements_window_check" CHECK ("ends_at" > "starts_at")
);--> statement-breakpoint
ALTER TABLE "premium_entitlements" ADD CONSTRAINT "premium_entitlements_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "premium_entitlements_user_effective_idx" ON "premium_entitlements" ("user_id", "status", "ends_at");--> statement-breakpoint
CREATE INDEX "premium_entitlements_source_end_idx" ON "premium_entitlements" ("source", "ends_at");--> statement-breakpoint

CREATE TABLE "billing_testers" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "created_by_admin_user_id" uuid,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "billing_testers" ADD CONSTRAINT "billing_testers_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_testers" ADD CONSTRAINT "billing_testers_admin_fk" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "google_play_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "package_name" text NOT NULL,
  "product_id" text NOT NULL,
  "purchase_token_hash" text NOT NULL,
  "purchase_token_ciphertext" text NOT NULL,
  "purchase_token_iv" text NOT NULL,
  "purchase_token_auth_tag" text NOT NULL,
  "status" text NOT NULL,
  "store_subscription_id" text,
  "linked_purchase_token_hash" text,
  "starts_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "auto_renew_enabled" boolean,
  "last_verified_at" timestamp with time zone NOT NULL,
  "verification_error_code" text,
  "cancelled_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "google_play_subscriptions_token_hash_unique" UNIQUE("purchase_token_hash"),
  CONSTRAINT "google_play_subscriptions_status_check" CHECK ("status" IN ('active', 'grace_period', 'on_hold', 'paused', 'cancelled', 'expired', 'revoked', 'pending')),
  CONSTRAINT "google_play_subscriptions_window_check" CHECK ("expires_at" > "starts_at")
);--> statement-breakpoint
ALTER TABLE "google_play_subscriptions" ADD CONSTRAINT "google_play_subscriptions_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_play_subscriptions_user_status_idx" ON "google_play_subscriptions" ("user_id", "status", "expires_at");--> statement-breakpoint
CREATE INDEX "google_play_subscriptions_reconcile_idx" ON "google_play_subscriptions" ("last_verified_at", "status");--> statement-breakpoint

CREATE TABLE "premium_profile_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "frame_style" text DEFAULT 'NONE' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "premium_profile_preferences_frame_check" CHECK ("frame_style" IN ('NONE', 'WARM_METALLIC', 'BLACK_GLASS', 'WARM_HALO'))
);--> statement-breakpoint
ALTER TABLE "premium_profile_preferences" ADD CONSTRAINT "premium_profile_preferences_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "invite_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "code" varchar(12) NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "share_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invite_codes_user_unique" UNIQUE("user_id"),
  CONSTRAINT "invite_codes_code_unique" UNIQUE("code"),
  CONSTRAINT "invite_codes_status_check" CHECK ("status" IN ('active', 'disabled')),
  CONSTRAINT "invite_codes_share_count_check" CHECK ("share_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "invite_attributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invite_code_id" uuid,
  "inviter_user_id" uuid,
  "invitee_user_id" uuid,
  "anonymous_install_id_hash" text,
  "source_code" text NOT NULL,
  "opened_at" timestamp with time zone,
  "registered_at" timestamp with time zone,
  "profile_completed_at" timestamp with time zone,
  "first_useful_action_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invite_attributions_invitee_unique" UNIQUE("invitee_user_id"),
  CONSTRAINT "invite_attributions_install_unique" UNIQUE("anonymous_install_id_hash"),
  CONSTRAINT "invite_attributions_source_check" CHECK ("source_code" ~ '^[a-z0-9_]{2,40}$')
);--> statement-breakpoint
ALTER TABLE "invite_attributions" ADD CONSTRAINT "invite_attributions_code_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_attributions" ADD CONSTRAINT "invite_attributions_inviter_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_attributions" ADD CONSTRAINT "invite_attributions_invitee_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_attributions_inviter_activation_idx" ON "invite_attributions" ("inviter_user_id", "activated_at");--> statement-breakpoint

CREATE TABLE "product_analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "event_name" text NOT NULL,
  "source_code" text,
  "geo_bucket" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "product_analytics_events" ADD CONSTRAINT "product_analytics_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_analytics_events_name_time_idx" ON "product_analytics_events" ("event_name", "occurred_at");--> statement-breakpoint
CREATE INDEX "product_analytics_events_user_time_idx" ON "product_analytics_events" ("user_id", "occurred_at");--> statement-breakpoint
CREATE INDEX "product_analytics_events_source_time_idx" ON "product_analytics_events" ("source_code", "occurred_at");--> statement-breakpoint

CREATE TABLE "push_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "messages" boolean DEFAULT true NOT NULL,
  "together" boolean DEFAULT true NOT NULL,
  "community_activity" boolean DEFAULT true NOT NULL,
  "premium_account" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "push_preferences" ADD CONSTRAINT "push_preferences_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "user_availability_intents" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "active_today_until" timestamp with time zone,
  "notify_when_activity" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_availability_intents" ADD CONSTRAINT "user_availability_intents_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_availability_active_idx" ON "user_availability_intents" ("active_today_until") WHERE "active_today_until" IS NOT NULL;--> statement-breakpoint

CREATE TABLE "activity_notification_cooldowns" (
  "watcher_user_id" uuid NOT NULL,
  "geo_bucket" text NOT NULL,
  "last_notified_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("watcher_user_id", "geo_bucket")
);--> statement-breakpoint
ALTER TABLE "activity_notification_cooldowns" ADD CONSTRAINT "activity_notification_cooldowns_user_fk" FOREIGN KEY ("watcher_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "together_share_consents" (
  "session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "consented_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  PRIMARY KEY ("session_id", "user_id")
);--> statement-breakpoint
ALTER TABLE "together_share_consents" ADD CONSTRAINT "together_share_consents_session_fk" FOREIGN KEY ("session_id") REFERENCES "public"."together_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "together_share_consents" ADD CONSTRAINT "together_share_consents_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("type" IN ('direct_message', 'together_match', 'together_action', 'announcement', 'founder_activated', 'founder_premium_started', 'founder_premium_expiring', 'founder_premium_expired', 'premium_activated', 'premium_restored', 'premium_billing_issue', 'community_activity'));
