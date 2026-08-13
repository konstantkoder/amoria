import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("Story Sparks live rounds are unique per session and user in PostgreSQL", () => {
  const migration = read("src/db/migrations/0033_together_story_round_integrity.sql");
  const schema = read("src/db/schema.ts");
  const repository = read("src/together/together.repo.ts");

  assert.match(migration, /PARTITION BY "session_id", "from_user_id", \("payload"->>'roundId'\)/);
  assert.match(migration, /DELETE FROM "together_events"/);
  assert.match(migration, /CREATE UNIQUE INDEX "together_events_story_round_unique"/);
  assert.match(schema, /uniqueIndex\("together_events_story_round_unique"\)/);
  assert.match(repository, /conflictReason: "story_round"/);
});
