ALTER TABLE "nearby_rooms" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD COLUMN "location_label" text;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD COLUMN "created_from_demand_snapshot" jsonb;
