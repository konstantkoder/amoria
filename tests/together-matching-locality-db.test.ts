import assert from "node:assert/strict";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testDatabaseUrl && /(test|scale|bench|dev)/i.test(new URL(testDatabaseUrl).pathname));

test("Together locality and concurrent claims use real PostgreSQL", { skip: !enabled }, async (t) => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl!;
  process.env.JWT_SECRET ||= "test-secret-that-is-long-enough";
  process.env.PUBLIC_API_URL ||= "http://localhost:4000";
  process.env.PUBLIC_MEDIA_URL ||= "http://localhost:4000/media";

  const { pool, closeDb } = await import("../src/db/client.js");
  const live = await import("../src/together/together.repo.js");
  const turnBased = await import("../src/together/together-turn-based.service.js");
  let sequence = 0;

  async function createUser(input: {
    gender?: "woman" | "man" | "nonbinary";
    preferredGenders?: Array<"woman" | "man" | "nonbinary">;
    birthDate?: string;
  } = {}): Promise<string> {
    sequence += 1;
    const result = await pool.query<{ id: string }>(`
      INSERT INTO users(
        email,password_hash,display_name,amoria_id,birth_date,gender,preferred_genders,
        preferred_age_min,preferred_age_max
      ) VALUES($1,'qa-hash',$2,$3,$4,$5,$6::jsonb,18,40)
      RETURNING id
    `, [
      `matching-locality-${sequence}@example.invalid`,
      `Matching ${sequence}`,
      `ML${String(sequence).padStart(10, "0")}`,
      input.birthDate ?? "1996-01-01",
      input.gender ?? "man",
      JSON.stringify(input.preferredGenders ?? ["woman"]),
    ]);
    return result.rows[0]!.id;
  }

  async function insertLiveWaiter(input: {
    userId: string;
    activity?: string;
    latitude: number;
    longitude: number;
    radiusKm: number | null;
    userAge?: number;
    preferredAgeMin?: number;
    preferredAgeMax?: number | null;
    createdAt: Date;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(`
      INSERT INTO together_queue(
        user_id,activity,status,created_at,expires_at,latitude,longitude,radius_km,
        location_updated_at,user_age,preferred_age_min,preferred_age_max
      ) VALUES($1,$2,'waiting',$3,now()+interval '1 hour',$4,$5,$6,now(),$7,$8,$9)
      RETURNING id
    `, [
      input.userId,
      input.activity ?? "draw",
      input.createdAt,
      input.latitude,
      input.longitude,
      input.radiusKm,
      input.userAge ?? 30,
      input.preferredAgeMin ?? 18,
      input.preferredAgeMax === undefined ? 40 : input.preferredAgeMax,
    ]);
    return result.rows[0]!.id;
  }

  async function insertTurnBasedWaiter(input: {
    userId: string;
    latitude: number;
    longitude: number;
    radiusKm: number | null;
    createdAt: Date;
  }): Promise<string> {
    const session = await pool.query<{ id: string }>(`
      INSERT INTO together_sessions(mode,activity,status,prompt_text)
      VALUES('turn_based','draw','active','QA locality') RETURNING id
    `);
    const sessionId = session.rows[0]!.id;
    await pool.query(
      "INSERT INTO together_session_members(session_id,user_id,last_seen_at) VALUES($1,$2,now())",
      [sessionId, input.userId],
    );
    const moment = await pool.query<{ id: string }>(`
      INSERT INTO together_turn_based_moments(
        status,stage,starter_user_id,draw_session_id,latitude,longitude,radius_km,
        starter_age,preferred_age_min,preferred_age_max,starter_gender,preferred_genders,
        starter_submitted_at,waiting_expires_at,last_transition,created_at
      ) VALUES(
        'waiting_for_partner','draw',$1,$2,$3,$4,$5,30,18,40,'man','["woman"]'::jsonb,
        now(),now()+interval '1 hour','starter_submitted',$6
      ) RETURNING id
    `, [input.userId, sessionId, input.latitude, input.longitude, input.radiusKm, input.createdAt]);
    await pool.query(
      "INSERT INTO together_turn_based_participants(moment_id,user_id,role) VALUES($1,$2,'starter')",
      [moment.rows[0]!.id, input.userId],
    );
    return moment.rows[0]!.id;
  }

  const liveInput = (userId: string, activity = "draw", radiusKm: 25 | null = 25) => ({
    userId,
    activity,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    promptText: "QA locality",
    latitude: 45.815,
    longitude: 15.982,
    radiusKm,
    locationUpdatedAt: new Date(),
    userAge: 30,
    preferredAgeMin: 18,
    preferredAgeMax: 40,
    gender: "woman" as const,
    preferredGenders: ["man" as const],
  });
  const turnInput = (requestId: string, radiusKm: 25 | null = 25) => ({
    location: { latitude: 45.815, longitude: 15.982, radiusKm },
    preferredAgeRange: { min: 18, max: 40 },
    clientRequestId: requestId,
  });

  try {
    await pool.query("TRUNCATE TABLE users CASCADE");
    const baseTime = Date.now() - 120_000;
    const viewer = await createUser({ gender: "woman", preferredGenders: ["man"] });
    for (let index = 0; index < 51; index += 1) {
      const userId = await createUser();
      await insertLiveWaiter({
        userId,
        latitude: 40.7128,
        longitude: -74.006,
        radiusKm: 25,
        createdAt: new Date(baseTime + index),
      });
    }
    const ageMismatch = await createUser();
    const ageMismatchEntryId = await insertLiveWaiter({
      userId: ageMismatch, latitude: 45.816, longitude: 15.983, radiusKm: 25,
      userAge: 60, createdAt: new Date(baseTime + 60),
    });
    const genderMismatch = await createUser({ gender: "woman", preferredGenders: ["woman"] });
    const genderMismatchEntryId = await insertLiveWaiter({
      userId: genderMismatch, latitude: 45.816, longitude: 15.983, radiusKm: 25,
      createdAt: new Date(baseTime + 61),
    });
    const blocked = await createUser();
    const blockedEntryId = await insertLiveWaiter({
      userId: blocked, latitude: 45.816, longitude: 15.983, radiusKm: 25,
      createdAt: new Date(baseTime + 62),
    });
    await pool.query("INSERT INTO blocked_users(user_id,blocked_user_id) VALUES($1,$2)", [viewer, blocked]);
    const compatible = await createUser();
    const compatibleEntryId = await insertLiveWaiter({
      userId: compatible, latitude: 45.816, longitude: 15.983, radiusKm: 25,
      createdAt: new Date(baseTime + 63),
    });

    const matched = await live.enqueueAndMatch(liveInput(viewer));
    assert.equal(matched.status, "matched");
    const liveRows = await pool.query<{ id: string; status: string; matched_session_id: string | null }>(
      "SELECT id,status,matched_session_id FROM together_queue WHERE id=ANY($1::uuid[])",
      [[compatibleEntryId, blockedEntryId, ageMismatchEntryId, genderMismatchEntryId]],
    );
    assert.equal(liveRows.rows.find((row) => row.id === compatibleEntryId)?.matched_session_id, matched.matchedSessionId);
    assert.equal(liveRows.rows.find((row) => row.id === blockedEntryId)?.status, "waiting");
    assert.equal(liveRows.rows.find((row) => row.id === ageMismatchEntryId)?.status, "waiting");
    assert.equal(liveRows.rows.find((row) => row.id === genderMismatchEntryId)?.status, "waiting");
    await t.test("live candidate after more than 50 older incompatible rows is matched", () => {});

    const unlimitedViewer = await createUser({ gender: "woman", preferredGenders: ["man"] });
    const farFinite = await createUser();
    await insertLiveWaiter({
      userId: farFinite, activity: "story_sparks", latitude: 40.7128, longitude: -74.006,
      radiusKm: 250, createdAt: new Date(baseTime + 70),
    });
    const farUnlimited = await createUser();
    const farUnlimitedEntry = await insertLiveWaiter({
      userId: farUnlimited, activity: "story_sparks", latitude: 40.7128, longitude: -74.006,
      radiusKm: null, createdAt: new Date(baseTime + 71),
    });
    const unlimitedMatch = await live.enqueueAndMatch(liveInput(unlimitedViewer, "story_sparks", null));
    assert.equal(unlimitedMatch.status, "matched");
    assert.equal(
      (await pool.query("SELECT matched_session_id FROM together_queue WHERE id=$1", [farUnlimitedEntry])).rows[0].matched_session_id,
      unlimitedMatch.matchedSessionId,
    );
    await t.test("live null-radius semantics skip far finite and accept no-limit candidate", () => {});

    await pool.query("TRUNCATE TABLE together_sessions CASCADE");
    for (let index = 0; index < 51; index += 1) {
      await insertTurnBasedWaiter({
        userId: await createUser(), latitude: 40.7128, longitude: -74.006, radiusKm: 25,
        createdAt: new Date(baseTime + index),
      });
    }
    const turnTarget = await insertTurnBasedWaiter({
      userId: await createUser(), latitude: 45.816, longitude: 15.983, radiusKm: 25,
      createdAt: new Date(baseTime + 60),
    });
    const turnViewer = await createUser({ gender: "woman", preferredGenders: ["man"] });
    assert.equal((await turnBased.start(turnViewer, turnInput("turn-locality"))).moment?.id, turnTarget);
    await t.test("turn-based candidate after a large incompatible population is found", () => {});

    const unlimitedTurnTarget = await insertTurnBasedWaiter({
      userId: await createUser(), latitude: 40.7128, longitude: -74.006, radiusKm: null,
      createdAt: new Date(baseTime + 65),
    });
    const unlimitedTurnViewer = await createUser({ gender: "woman", preferredGenders: ["man"] });
    assert.equal(
      (await turnBased.start(unlimitedTurnViewer, turnInput("turn-unlimited", null))).moment?.id,
      unlimitedTurnTarget,
    );
    await t.test("turn-based null-radius semantics avoid global finite-radius trigonometry", () => {});

    const lockedCandidate = await insertTurnBasedWaiter({
      userId: await createUser(), latitude: 45.816, longitude: 15.983, radiusKm: 25,
      createdAt: new Date(baseTime + 70),
    });
    const nextCandidate = await insertTurnBasedWaiter({
      userId: await createUser(), latitude: 45.817, longitude: 15.984, radiusKm: 25,
      createdAt: new Date(baseTime + 71),
    });
    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT id FROM together_turn_based_moments WHERE id=$1 FOR UPDATE", [lockedCandidate]);
      const skipViewer = await createUser({ gender: "woman", preferredGenders: ["man"] });
      assert.equal((await turnBased.start(skipViewer, turnInput("turn-skip-locked"))).moment?.id, nextCandidate);
    } finally {
      await lockClient.query("ROLLBACK");
      lockClient.release();
    }
    await t.test("turn-based claim skips a locked compatible row", () => {});
    await pool.query(
      "UPDATE together_turn_based_moments SET status='cancelled',cancel_reason='qa_cleanup' WHERE status='waiting_for_partner'",
    );

    const contested = await insertTurnBasedWaiter({
      userId: await createUser(), latitude: 45.816, longitude: 15.983, radiusKm: 25,
      createdAt: new Date(baseTime + 80),
    });
    const claimers = await Promise.all([
      createUser({ gender: "woman", preferredGenders: ["man"] }),
      createUser({ gender: "woman", preferredGenders: ["man"] }),
    ]);
    const claims = await Promise.all(claimers.map((userId, index) =>
      turnBased.start(userId, turnInput(`turn-contested-${index}`))));
    assert.equal(claims.filter((claim) => claim.moment?.id === contested).length, 1);
    assert.equal(
      Number((await pool.query(
        "SELECT count(*) count FROM together_turn_based_participants WHERE moment_id=$1 AND role='partner' AND active=true",
        [contested],
      )).rows[0].count),
      1,
    );
    await t.test("two simultaneous claimers cannot claim the same starter", () => {});
  } finally {
    await closeDb();
  }
});
