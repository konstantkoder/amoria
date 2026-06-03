CREATE TABLE "nearby_profile_visibility" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'off' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"radius_km" integer,
	"nearby_status" text,
	"status_kind" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "nearby_profile_visibility_status_check" CHECK ("nearby_profile_visibility"."status" IN ('active', 'off', 'expired')),
	CONSTRAINT "nearby_profile_visibility_status_kind_check" CHECK ("nearby_profile_visibility"."status_kind" IS NULL OR "nearby_profile_visibility"."status_kind" IN ('coffee', 'walk', 'bike', 'talk_now', 'open_to_suggestions')),
	CONSTRAINT "nearby_profile_visibility_latitude_check" CHECK ("nearby_profile_visibility"."latitude" IS NULL OR ("nearby_profile_visibility"."latitude" >= -90 AND "nearby_profile_visibility"."latitude" <= 90)),
	CONSTRAINT "nearby_profile_visibility_longitude_check" CHECK ("nearby_profile_visibility"."longitude" IS NULL OR ("nearby_profile_visibility"."longitude" >= -180 AND "nearby_profile_visibility"."longitude" <= 180)),
	CONSTRAINT "nearby_profile_visibility_radius_km_check" CHECK ("nearby_profile_visibility"."radius_km" IS NULL OR ("nearby_profile_visibility"."radius_km" >= 1 AND "nearby_profile_visibility"."radius_km" <= 250)),
	CONSTRAINT "nearby_profile_visibility_active_location_check" CHECK ("nearby_profile_visibility"."status" <> 'active' OR ("nearby_profile_visibility"."latitude" IS NOT NULL AND "nearby_profile_visibility"."longitude" IS NOT NULL AND "nearby_profile_visibility"."radius_km" IS NOT NULL AND "nearby_profile_visibility"."expires_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_genders" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nearby_profile_visibility" ADD CONSTRAINT "nearby_profile_visibility_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nearby_profile_visibility_status_expires_idx" ON "nearby_profile_visibility" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_gender_check" CHECK ("users"."gender" IS NULL OR "users"."gender" IN ('woman', 'man', 'nonbinary'));
