import { randomBytes } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.QA_DATABASE_URL;
if (!databaseUrl) throw new Error("QA_DATABASE_URL is required");
const email = `amoria.qa.smtp-failure.${Date.now()}.${randomBytes(3).toString("hex")}@example.com`;
const password = `${randomBytes(18).toString("base64url")}Aa1!`;
const response = await fetch("http://localhost:4000/auth/register", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-device-id": "qa-smtp-failure",
    "x-forwarded-for": "198.51.100.121",
  },
  body: JSON.stringify({ email, password, displayName: "SMTP Failure QA", locale: "en" }),
});
const body = await response.json();
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const state = await client.query(
    `SELECT u.email_verified_at,
       (SELECT count(*)::int FROM refresh_tokens rt WHERE rt.user_id = u.id) AS refresh_count,
       (SELECT count(*)::int FROM auth_email_challenges c WHERE c.user_id = u.id AND c.consumed_at IS NULL) AS active_challenges
     FROM users u WHERE u.email = $1`,
    [email],
  );
  const row = state.rows[0];
  const passed = response.status === 503
    && body?.error?.code === "email_delivery_unavailable"
    && row?.email_verified_at === null
    && row?.refresh_count === 0
    && row?.active_challenges === 0;
  console.log(`SMTP_FAILURE_NO_AUTH=${passed ? "YES" : "NO"}`);
  if (!passed) process.exitCode = 1;
} finally {
  await client.end();
}
