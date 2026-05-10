DO $$
DECLARE
  invalid_direct_count integer;
  duplicate_pair_count integer;
BEGIN
  SELECT count(*) INTO invalid_direct_count
  FROM (
    SELECT t.id
    FROM "threads" t
    LEFT JOIN "thread_members" tm ON tm."thread_id" = t.id
    WHERE t."type" = 'direct'
    GROUP BY t.id
    HAVING count(tm."user_id") <> 2
  ) invalid_direct_threads;

  IF invalid_direct_count > 0 THEN
    RAISE EXCEPTION 'Cannot backfill direct_thread_pairs: % direct thread(s) do not have exactly two members.', invalid_direct_count
      USING ERRCODE = '23514';
  END IF;

  WITH direct_pair_threads AS (
    SELECT
      CASE WHEN m1."user_id"::text < m2."user_id"::text THEN m1."user_id" ELSE m2."user_id" END AS user_a_id,
      CASE WHEN m1."user_id"::text < m2."user_id"::text THEN m2."user_id" ELSE m1."user_id" END AS user_b_id,
      t.id AS thread_id
    FROM "threads" t
    INNER JOIN "thread_members" m1 ON m1."thread_id" = t.id
    INNER JOIN "thread_members" m2
      ON m2."thread_id" = t.id
      AND m1."user_id"::text < m2."user_id"::text
    WHERE t."type" = 'direct'
  )
  SELECT count(*) INTO duplicate_pair_count
  FROM (
    SELECT user_a_id, user_b_id
    FROM direct_pair_threads
    GROUP BY user_a_id, user_b_id
    HAVING count(*) > 1
  ) duplicate_direct_pairs;

  IF duplicate_pair_count > 0 THEN
    RAISE EXCEPTION 'Cannot backfill direct_thread_pairs: duplicate direct threads exist for % user pair(s). Resolve duplicates before applying 0009_direct_thread_context_history.', duplicate_pair_count
      USING ERRCODE = '23505';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "direct_thread_pairs" (
  "user_a_id" uuid NOT NULL,
  "user_b_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "direct_thread_pairs_user_a_id_user_b_id_pk" PRIMARY KEY("user_a_id","user_b_id"),
  CONSTRAINT "direct_thread_pairs_thread_id_unique" UNIQUE("thread_id"),
  CONSTRAINT "direct_thread_pairs_canonical_check" CHECK ("user_a_id"::text < "user_b_id"::text)
);
--> statement-breakpoint
ALTER TABLE "direct_thread_pairs" ADD CONSTRAINT "direct_thread_pairs_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "direct_thread_pairs" ADD CONSTRAINT "direct_thread_pairs_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "direct_thread_pairs" ADD CONSTRAINT "direct_thread_pairs_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "direct_thread_pairs" ("user_a_id", "user_b_id", "thread_id", "created_at")
SELECT
  CASE WHEN m1."user_id"::text < m2."user_id"::text THEN m1."user_id" ELSE m2."user_id" END AS user_a_id,
  CASE WHEN m1."user_id"::text < m2."user_id"::text THEN m2."user_id" ELSE m1."user_id" END AS user_b_id,
  t.id AS thread_id,
  t."created_at"
FROM "threads" t
INNER JOIN "thread_members" m1 ON m1."thread_id" = t.id
INNER JOIN "thread_members" m2
  ON m2."thread_id" = t.id
  AND m1."user_id"::text < m2."user_id"::text
WHERE t."type" = 'direct';
--> statement-breakpoint
CREATE TABLE "thread_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "metadata" jsonb,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "thread_contexts_thread_source_unique" UNIQUE("thread_id","source_type","source_id")
);
--> statement-breakpoint
ALTER TABLE "thread_contexts" ADD CONSTRAINT "thread_contexts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "thread_contexts" ADD CONSTRAINT "thread_contexts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "thread_contexts_thread_id_idx" ON "thread_contexts" USING btree ("thread_id");
--> statement-breakpoint
CREATE INDEX "thread_contexts_source_idx" ON "thread_contexts" USING btree ("source_type","source_id");
--> statement-breakpoint
INSERT INTO "thread_contexts" ("thread_id", "source_type", "source_id", "metadata", "created_at")
SELECT "id", "source_type", "source_id", NULL, "created_at"
FROM "threads"
WHERE "source_type" IS NOT NULL AND "source_id" IS NOT NULL
ON CONFLICT ("thread_id","source_type","source_id") DO NOTHING;
