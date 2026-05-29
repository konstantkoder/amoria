ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_age_min" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_age_max" integer;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_age_min_check" CHECK ("preferred_age_min" >= 18 AND "preferred_age_min" <= 120);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_age_max_check" CHECK ("preferred_age_max" IS NULL OR ("preferred_age_max" >= "preferred_age_min" AND "preferred_age_max" <= 120));--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "user_age" integer;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "preferred_age_min" integer;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "preferred_age_max" integer;--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_user_age_check" CHECK ("user_age" IS NULL OR ("user_age" >= 18 AND "user_age" <= 120));--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_preferred_age_min_check" CHECK ("preferred_age_min" IS NULL OR ("preferred_age_min" >= 18 AND "preferred_age_min" <= 120));--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_preferred_age_max_check" CHECK ("preferred_age_max" IS NULL OR ("preferred_age_min" IS NOT NULL AND "preferred_age_max" >= "preferred_age_min" AND "preferred_age_max" <= 120));
