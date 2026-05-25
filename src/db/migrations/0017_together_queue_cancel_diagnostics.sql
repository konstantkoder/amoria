ALTER TABLE "together_queue" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "cancel_source" text;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "last_action" text;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "last_action_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "last_client_poll_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_cancel_source_check" CHECK ("cancel_source" IS NULL OR "cancel_source" IN ('user_stop', 'user_back', 'retry_restart', 'radius_expansion', 'screen_cleanup', 'navigation_blur', 'admin_cancel', 'server_expired', 'matched', 'unknown'));
