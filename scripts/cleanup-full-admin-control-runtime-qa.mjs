import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import pg from "pg";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const outputPath = process.argv[2];
const databaseUrl = new URL(process.env.DATABASE_URL);
const allowedDatabaseHosts = new Set(["127.0.0.1", "localhost", "postgres"]);
assert(
  allowedDatabaseHosts.has(databaseUrl.hostname),
  `Refusing QA cleanup for non-local database host: ${databaseUrl.hostname}`,
);

const qaEmails = [
  "qa-owner-control@amoria.local",
  "qa-moderator-control@amoria.local",
  "qa-support-control@amoria.local",
  "qa-ops-control@amoria.local",
  "qa-disabled-control@amoria.local",
  "qa-normal-control@amoria.local",
  "qa-target-control@amoria.local",
  "qa-reporter-control@amoria.local",
];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: ["1", "true"].includes(String(process.env.S3_FORCE_PATH_STYLE).toLowerCase()),
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

async function listQaObjects() {
  const keys = [];
  let continuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: "qa/full-admin/",
      ContinuationToken: continuationToken,
    }));
    keys.push(...(page.Contents ?? []).flatMap((entry) => entry.Key ? [entry.Key] : []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function run() {
  const client = await pool.connect();
  const result = {
    completedAt: undefined,
    qaUsersFound: 0,
    refreshTokensRevoked: 0,
    adminUsersRemoved: 0,
    nearbyProfilesDisabled: 0,
    waitingTogetherEntriesCancelled: 0,
    activeNearbyMembershipsRemoved: 0,
    unreferencedQaObjectsRemoved: 0,
  };
  try {
    await client.query("BEGIN");
    const users = await client.query(
      "SELECT id FROM users WHERE lower(email) = ANY($1::text[]) FOR UPDATE",
      [qaEmails],
    );
    const userIds = users.rows.map((row) => row.id);
    result.qaUsersFound = userIds.length;

    if (userIds.length > 0) {
      result.refreshTokensRevoked = (await client.query(
        "UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=ANY($1::uuid[]) AND revoked_at IS NULL",
        [userIds],
      )).rowCount;
      await client.query(
        "UPDATE users SET account_status='active',suspended_at=NULL,suspension_reason=NULL,suspended_by_admin_user_id=NULL WHERE id=ANY($1::uuid[])",
        [userIds],
      );
      result.nearbyProfilesDisabled = (await client.query(
        "UPDATE nearby_profile_visibility SET status='off',latitude=NULL,longitude=NULL,radius_km=NULL,nearby_status=NULL,status_kind=NULL,expires_at=NULL,updated_at=now() WHERE user_id=ANY($1::uuid[])",
        [userIds],
      )).rowCount;
      await client.query("DELETE FROM nearby_statuses WHERE author_user_id=ANY($1::uuid[])", [userIds]);
      result.waitingTogetherEntriesCancelled = (await client.query(
        "UPDATE together_queue SET status='cancelled',cancelled_at=now(),cancel_source='screen_cleanup',cancel_reason='release QA cleanup' WHERE user_id=ANY($1::uuid[]) AND status='waiting'",
        [userIds],
      )).rowCount;
      result.activeNearbyMembershipsRemoved = (await client.query(
        "UPDATE nearby_room_memberships SET status='removed',left_at=COALESCE(left_at,now()) WHERE user_id=ANY($1::uuid[]) AND status='active'",
        [userIds],
      )).rowCount;
      await client.query("DELETE FROM auth_email_challenges WHERE user_id=ANY($1::uuid[])", [userIds]);
      result.adminUsersRemoved = (await client.query(
        "DELETE FROM admin_users WHERE user_id=ANY($1::uuid[])",
        [userIds],
      )).rowCount;
    }
    await client.query("DELETE FROM auth_rate_limits WHERE scope LIKE 'login:qa-%-control@amoria.local%'");
    await client.query("COMMIT");

    const qaKeys = await listQaObjects();
    if (qaKeys.length > 0) {
      const referenced = await pool.query(
        "SELECT path FROM media_files WHERE path=ANY($1::text[])",
        [qaKeys],
      );
      const referencedKeys = new Set(referenced.rows.map((row) => row.path));
      const orphanKeys = qaKeys.filter((key) => !referencedKeys.has(key));
      for (let offset = 0; offset < orphanKeys.length; offset += 1000) {
        const batch = orphanKeys.slice(offset, offset + 1000);
        if (batch.length === 0) continue;
        await s3.send(new DeleteObjectsCommand({
          Bucket: process.env.S3_BUCKET,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }));
        result.unreferencedQaObjectsRemoved += batch.length;
      }
    }
    result.completedAt = new Date().toISOString();
    if (outputPath) await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
    s3.destroy();
  }
}

await run();
