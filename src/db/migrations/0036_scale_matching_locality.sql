-- Geographic prefilters for live and turn-based Together candidate selection.
-- On a large production database, stage equivalent CREATE INDEX CONCURRENTLY
-- statements outside the transactional migrator before deploying this migration.
CREATE INDEX IF NOT EXISTS "together_queue_waiting_activity_geo_created_idx"
  ON "together_queue" ("activity", "latitude", "longitude", "created_at", "id")
  WHERE "status" = 'waiting' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "together_turn_based_waiting_geo_created_idx"
  ON "together_turn_based_moments" ("latitude", "longitude", "created_at", "id")
  WHERE "status" = 'waiting_for_partner';
