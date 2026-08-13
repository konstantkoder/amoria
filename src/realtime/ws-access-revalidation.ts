import { pool } from "../db/client";
import { incrementMetric, setMetric } from "../observability/metrics";
import { wsHub } from "./ws.hub";

const REVALIDATION_BATCH_SIZE = 500;

type ActiveAccessRow = { id: string; auth_version: number };

export async function revalidateConnectedUserAccess(): Promise<void> {
  const userIds = wsHub.connectedUserIds();
  setMetric("amoria_ws_access_revalidation_users", userIds.length);
  if (userIds.length === 0) return;

  let disconnected = 0;
  for (let offset = 0; offset < userIds.length; offset += REVALIDATION_BATCH_SIZE) {
    const batch = userIds.slice(offset, offset + REVALIDATION_BATCH_SIZE);
    const result = await pool.query<ActiveAccessRow>(
      `SELECT id, auth_version
         FROM users
        WHERE id = ANY($1::uuid[])
          AND account_status = 'active'`,
      [batch],
    );
    const activeVersions = new Map(result.rows.map((row) => [row.id, row.auth_version]));
    for (const userId of batch) {
      disconnected += wsHub.revalidateUserAccess(userId, activeVersions.get(userId));
    }
  }

  incrementMetric("amoria_ws_access_revalidations_total", {}, userIds.length);
  if (disconnected > 0) {
    incrementMetric("amoria_ws_access_revalidation_disconnects_total", {}, disconnected);
  }
}
