CREATE TABLE "nearby_room_memberships" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "nearby_room_memberships_room_id_user_id_pk" PRIMARY KEY("room_id","user_id"),
	CONSTRAINT "nearby_room_memberships_status_check" CHECK ("nearby_room_memberships"."status" IN ('active', 'left', 'removed')),
	CONSTRAINT "nearby_room_memberships_role_check" CHECK ("nearby_room_memberships"."role" IN ('member', 'moderator', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "nearby_room_types" (
	"key" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"admin_approved" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nearby_room_types_status_check" CHECK ("nearby_room_types"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "nearby_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type_key" text NOT NULL,
	"thread_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"geo_bucket" text NOT NULL,
	"created_by_admin_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nearby_rooms_status_check" CHECK ("nearby_rooms"."status" IN ('active', 'closed', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "room_moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"admin_user_id" uuid,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"target_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nearby_room_memberships" ADD CONSTRAINT "nearby_room_memberships_room_id_nearby_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."nearby_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nearby_room_memberships" ADD CONSTRAINT "nearby_room_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD CONSTRAINT "nearby_rooms_type_key_nearby_room_types_key_fk" FOREIGN KEY ("type_key") REFERENCES "public"."nearby_room_types"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD CONSTRAINT "nearby_rooms_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nearby_rooms" ADD CONSTRAINT "nearby_rooms_created_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_room_id_nearby_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."nearby_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_moderation_actions" ADD CONSTRAINT "room_moderation_actions_target_message_id_messages_id_fk" FOREIGN KEY ("target_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nearby_room_memberships_user_status_idx" ON "nearby_room_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "nearby_rooms_type_status_idx" ON "nearby_rooms" USING btree ("type_key","status");--> statement-breakpoint
CREATE INDEX "nearby_rooms_geo_status_idx" ON "nearby_rooms" USING btree ("geo_bucket","status");--> statement-breakpoint
CREATE INDEX "room_moderation_actions_room_created_at_idx" ON "room_moderation_actions" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "room_moderation_actions_admin_created_at_idx" ON "room_moderation_actions" USING btree ("admin_user_id","created_at");--> statement-breakpoint
INSERT INTO "nearby_room_types" ("key", "title", "status", "admin_approved", "sort_order") VALUES
  ('coffee_nearby', 'Кофе рядом', 'active', true, 10),
  ('walk_nearby', 'Прогулка рядом', 'active', true, 20),
  ('bike_nearby', 'Велосипед рядом', 'active', true, 30),
  ('cinema_today', 'Кино сегодня', 'active', true, 40),
  ('talk_nearby', 'Пообщаться рядом', 'active', true, 50),
  ('evening_nearby', 'Вечерний чат района', 'active', true, 60)
ON CONFLICT ("key") DO UPDATE SET
  "title" = EXCLUDED."title",
  "status" = EXCLUDED."status",
  "admin_approved" = EXCLUDED."admin_approved",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();
