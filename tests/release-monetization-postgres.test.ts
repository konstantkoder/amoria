import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/db/client";
import {
  changeMode,
  progressFounderCandidate,
} from "../src/monetization/monetization.service";

const enabled = process.env.RUN_RELEASE_MONETIZATION_PG === "1";

test("real PostgreSQL enforces Founder concurrency, #500/no #501 and durable first ON", { skip: !enabled }, async () => {
  const marker = `release-monetization-${Date.now()}`;
  const adminUser = await pool.query<{ id: string; amoria_id: string }>(
    `INSERT INTO users
      (email, email_verified_at, password_hash, display_name, amoria_id, birth_date,
       gender, preferred_genders, goal, account_status)
     VALUES ($1, now(), 'test-hash', 'Release Owner', $2, '1990-01-01',
       'woman', '["man"]'::jsonb, 'relationship', 'active')
     RETURNING id, amoria_id`,
    [`${marker}-owner@example.invalid`, `Z${Date.now().toString(36).slice(-10).toUpperCase()}`],
  );
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO admin_users (user_id, email, display_name) VALUES ($1, $2, 'Release Owner') RETURNING id`,
    [adminUser.rows[0].id, `${marker}-owner@example.invalid`],
  );
  const owner = {
    adminUser: {
      id: admin.rows[0].id,
      userId: adminUser.rows[0].id,
      status: "active" as const,
      roles: ["owner" as const],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    user: {
      id: adminUser.rows[0].id,
      amoriaId: adminUser.rows[0].amoria_id,
      displayName: "Release Owner",
      email: `${marker}-owner@example.invalid`,
    },
  };

  try {
    await pool.query(`UPDATE monetization_settings SET mode = 'OFF', first_monetization_enabled_at = NULL, founder_campaign_status = 'ACTIVE' WHERE id = 1`);
    const users = await pool.query<{ id: string }>(
      `INSERT INTO users
        (email, email_verified_at, password_hash, display_name, amoria_id, birth_date,
         gender, preferred_genders, goal, account_status)
       SELECT $1 || '-' || n || '@example.invalid', now(), 'test-hash', 'Founder ' || n,
              'F' || lpad(n::text, 10, '0'), '1990-01-01', 'woman', '["man"]'::jsonb,
              'relationship', 'active'
         FROM generate_series(1, 501) n
       RETURNING id`,
      [marker],
    );
    await pool.query(
      `INSERT INTO media_files
        (owner_user_id, type, path, url, mime_type, size_bytes, moderation_state, moderation_origin)
       SELECT id, 'profile_photo', 'test/' || id, '/media/' || id, 'image/jpeg', 1024,
              'approved', 'manual'
         FROM users WHERE email LIKE $1`,
      [`${marker}-%`],
    );
    await pool.query(
      `INSERT INTO user_activity_preferences (user_id, activity_key, status, source)
       SELECT id, 'coffee_nearby', 'active', 'nearby_questionnaire'
         FROM users WHERE email LIKE $1`,
      [`${marker}-%`],
    );

    const eligible = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM users u
        WHERE u.email LIKE $1 AND u.display_name LIKE 'Founder %' AND u.email_verified_at IS NOT NULL
          AND u.birth_date IS NOT NULL AND u.display_name <> ''
          AND u.gender IS NOT NULL AND jsonb_array_length(u.preferred_genders) > 0
          AND u.goal IS NOT NULL
          AND EXISTS (SELECT 1 FROM media_files mf WHERE mf.owner_user_id = u.id
            AND mf.type IN ('avatar', 'profile_photo') AND mf.moderation_state = 'approved'
            AND mf.physically_purged_at IS NULL)
          AND EXISTS (SELECT 1 FROM user_activity_preferences p WHERE p.user_id = u.id AND p.status = 'active')`,
      [`${marker}-%`],
    );
    assert.equal(eligible.rows[0]?.count, 501);

    await progressFounderCandidate(users.rows[0]!.id);
    const firstCandidate = await pool.query<{ status: string; founder_number: number | null }>(
      `SELECT status, founder_number FROM founders WHERE user_id = $1`,
      [users.rows[0]!.id],
    );
    assert.deepEqual(firstCandidate.rows[0], { status: "activated", founder_number: 1 });
    await Promise.all(users.rows.map((row) => progressFounderCandidate(row.id)));
    const founderCounts = await pool.query<{ activated: number; unique_numbers: number; max_number: number }>(
      `SELECT count(*) FILTER (WHERE f.status = 'activated')::int AS activated,
              count(DISTINCT f.founder_number)::int AS unique_numbers,
              max(f.founder_number)::int AS max_number
         FROM founders f JOIN users u ON u.id = f.user_id
        WHERE u.email LIKE $1`,
      [`${marker}-%`],
    );
    assert.deepEqual(founderCounts.rows[0], { activated: 500, unique_numbers: 500, max_number: 500 });
    await assert.rejects(
      pool.query(
        `INSERT INTO founders (user_id, status, founder_number, reservation_expires_at, activated_at)
         VALUES ($1, 'activated', 501, now() + interval '24 hours', now())`,
        [adminUser.rows[0].id],
      ),
      (error: unknown) => (error as { code?: string }).code === "23514",
    );

    const firstOn = await changeMode(owner, {
      mode: "ON",
      reason: "Real PostgreSQL first ON durability test",
      confirmFirstOn: true,
    }, {});
    assert.ok(firstOn.firstMonetizationEnabledAt);
    await changeMode(owner, { mode: "OFF", reason: "Real PostgreSQL mode toggle test" }, {});
    const secondOn = await changeMode(owner, {
      mode: "ON",
      reason: "Real PostgreSQL repeated ON durability test",
      confirmFirstOn: true,
    }, {});
    assert.equal(secondOn.firstMonetizationEnabledAt, firstOn.firstMonetizationEnabledAt);
    const founderWindow = await pool.query<{ distinct_starts: number; exact_windows: number }>(
      `SELECT count(DISTINCT premium_starts_at)::int AS distinct_starts,
              count(*) FILTER (WHERE premium_ends_at = premium_starts_at + interval '1 year')::int AS exact_windows
         FROM founders f JOIN users u ON u.id = f.user_id
        WHERE u.email LIKE $1 AND f.status = 'activated'`,
      [`${marker}-%`],
    );
    assert.deepEqual(founderWindow.rows[0], { distinct_starts: 1, exact_windows: 500 });
  } finally {
    await pool.query(`DELETE FROM users WHERE email LIKE $1 OR email = $2`, [
      `${marker}-%`,
      `${marker}-owner@example.invalid`,
    ]);
    await pool.query(`UPDATE monetization_settings SET mode = 'OFF', first_monetization_enabled_at = NULL, founder_campaign_status = 'ACTIVE', updated_by_admin_user_id = NULL WHERE id = 1`);
  }
});
