CREATE TABLE "user_activity_preferences" (
	"user_id" uuid NOT NULL,
	"activity_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"geo_bucket" text,
	"source" text DEFAULT 'nearby_questionnaire' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_preferences_activity_key_check" CHECK ("user_activity_preferences"."activity_key" IN ('coffee_nearby', 'walk_nearby', 'bike_nearby', 'cinema_today', 'talk_nearby', 'evening_nearby', 'roller_skating_nearby', 'kayaking_nearby', 'fishing_nearby', 'sport_nearby', 'language_exchange_nearby', 'local_event_nearby')),
	CONSTRAINT "user_activity_preferences_status_check" CHECK ("user_activity_preferences"."status" IN ('active', 'disabled')),
	CONSTRAINT "user_activity_preferences_source_check" CHECK ("user_activity_preferences"."source" IN ('nearby_questionnaire'))
);
--> statement-breakpoint
ALTER TABLE "user_activity_preferences" ADD CONSTRAINT "user_activity_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_activity_preferences_user_activity_geo_unique" ON "user_activity_preferences" USING btree ("user_id","activity_key","geo_bucket") WHERE "user_activity_preferences"."geo_bucket" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_activity_preferences_user_activity_global_unique" ON "user_activity_preferences" USING btree ("user_id","activity_key") WHERE "user_activity_preferences"."geo_bucket" IS NULL;--> statement-breakpoint
CREATE INDEX "user_activity_preferences_user_status_idx" ON "user_activity_preferences" USING btree ("user_id","status");