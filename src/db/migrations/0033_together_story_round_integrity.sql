WITH ranked_story_choices AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "session_id", "from_user_id", ("payload"->>'roundId')
      ORDER BY "created_at", "id"
    ) AS duplicate_rank
  FROM "together_events"
  WHERE
    "type" = 'story_choice'
    AND jsonb_typeof("payload") = 'object'
    AND NULLIF("payload"->>'roundId', '') IS NOT NULL
)
DELETE FROM "together_events"
USING ranked_story_choices
WHERE
  "together_events"."id" = ranked_story_choices."id"
  AND ranked_story_choices.duplicate_rank > 1;

CREATE UNIQUE INDEX "together_events_story_round_unique"
ON "together_events" USING btree (
  "session_id",
  "from_user_id",
  (("payload"->>'roundId'))
)
WHERE "type" = 'story_choice' AND "payload" ? 'roundId';
