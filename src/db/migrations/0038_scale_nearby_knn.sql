-- A measured 1M-user/200k-active dense-cell run showed that the bounding-box
-- btree still scanned and sorted the entire cell for each unique viewer.
-- PostgreSQL's built-in point GiST KNN operator bounds the ordinary candidate
-- set before exact Haversine, radius, block, and profile checks. Pre-stage this
-- exact index with CREATE INDEX CONCURRENTLY on a large existing table.
CREATE INDEX IF NOT EXISTS "nearby_profile_visibility_active_point_gist_idx"
  ON "nearby_profile_visibility" USING gist (point("longitude", "latitude"))
  WHERE "status" = 'active' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "nearby_statuses_point_gist_idx"
  ON "nearby_statuses" USING gist (point("lng", "lat"));
