CREATE TABLE "profile_gallery_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "media_id" uuid NOT NULL,
  "visibility" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profile_gallery_items_user_media_unique" UNIQUE("user_id","media_id"),
  CONSTRAINT "profile_gallery_items_visibility_check" CHECK ("visibility" IN ('public', 'locked'))
);
--> statement-breakpoint
CREATE TABLE "profile_locked_gallery_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "password_hash" text,
  "password_set_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_gallery_items" ADD CONSTRAINT "profile_gallery_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_gallery_items" ADD CONSTRAINT "profile_gallery_items_media_id_media_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_files"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "profile_locked_gallery_settings" ADD CONSTRAINT "profile_locked_gallery_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "profile_gallery_items_user_visibility_idx" ON "profile_gallery_items" USING btree ("user_id","visibility");
--> statement-breakpoint
INSERT INTO "profile_gallery_items" (
  "user_id",
  "media_id",
  "visibility",
  "position",
  "created_at",
  "updated_at"
)
WITH legacy_photos AS MATERIALIZED (
  SELECT
    u."id" AS user_id,
    photo.value ->> 'mediaId' AS media_id,
    photo.ordinality::integer - 1 AS position
  FROM "users" u
  CROSS JOIN LATERAL jsonb_array_elements(u."photos") WITH ORDINALITY AS photo(value, ordinality)
  WHERE (photo.value ->> 'mediaId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
SELECT
  legacy_photos.user_id,
  legacy_photos.media_id::uuid,
  'public',
  legacy_photos.position,
  now(),
  now()
FROM legacy_photos
INNER JOIN "media_files" mf
  ON mf."id" = legacy_photos.media_id::uuid
  AND mf."owner_user_id" = legacy_photos.user_id
ON CONFLICT ("user_id","media_id") DO NOTHING;
