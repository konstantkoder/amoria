ALTER TABLE "together_sessions" ADD COLUMN "ended_reason" text;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "together_session_members" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_session_members" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
UPDATE "together_session_members" SET "last_seen_at" = now() WHERE "last_seen_at" IS NULL;
