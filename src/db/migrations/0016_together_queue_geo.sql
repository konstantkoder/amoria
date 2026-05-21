ALTER TABLE "together_queue" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "radius_km" integer;--> statement-breakpoint
ALTER TABLE "together_queue" ADD COLUMN "location_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_radius_km_check" CHECK ("radius_km" IS NULL OR "radius_km" IN (5, 25, 100, 250));--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_latitude_check" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));--> statement-breakpoint
ALTER TABLE "together_queue" ADD CONSTRAINT "together_queue_longitude_check" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
