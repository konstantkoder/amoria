ALTER TABLE "nearby_rooms" DROP CONSTRAINT IF EXISTS "nearby_rooms_status_check";--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD CONSTRAINT "nearby_rooms_status_check" CHECK ("status" IN ('active', 'closed', 'disabled', 'archived', 'deleted'));--> statement-breakpoint
