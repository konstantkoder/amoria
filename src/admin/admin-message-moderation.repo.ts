import { pool } from "../db/client";
import type {
  AdminMessageDecision,
  AdminMessageDetail,
  AdminMessageQueueItem,
  AdminMessageQueueQuery,
} from "./admin-message-moderation.types";
import type { MessageModerationState } from "../moderation/message-moderation.types";

type QueueRow = {
  id: string;
  thread_id: string;
  source: "direct" | "nearby";
  state: MessageModerationState;
  automation_status: AdminMessageQueueItem["automationStatus"];
  sender_user_id: string;
  sender_amoria_id: string;
  sender_display_name: string;
  report_count: string | number;
  latest_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

type DetailRow = QueueRow & { text: string; client_message_id: string };

export async function listMessageQueue(query: AdminMessageQueueQuery): Promise<AdminMessageQueueItem[]> {
  const values: unknown[] = [];
  const filters: string[] = [
    `(s.state <> 'visible' OR EXISTS (
       SELECT 1 FROM safety_reports sr WHERE sr.target_type='message' AND sr.target_id=m.id::text
     ) OR EXISTS (
       SELECT 1 FROM message_moderation_reviews mr
        WHERE mr.message_id=m.id AND mr.action='flag'
     ))`,
  ];
  if (query.status === "reported") {
    filters.push(`EXISTS (SELECT 1 FROM safety_reports sr WHERE sr.target_type='message' AND sr.target_id=m.id::text)`);
  } else if (query.status !== "all") {
    values.push(query.status);
    filters.push(`s.state=$${values.length}`);
  }
  if (query.source) {
    values.push(query.source);
    filters.push(`s.source=$${values.length}`);
  }
  values.push(query.limit);
  const result = await pool.query<QueueRow>(
    `${queueSelect()} WHERE ${filters.join(" AND ")}
      ORDER BY s.updated_at DESC,m.created_at DESC LIMIT $${values.length}`,
    values,
  );
  return result.rows.map(toQueueItem);
}
export async function findMessageDetail(messageId: string): Promise<AdminMessageDetail | undefined> {
  const result = await pool.query<DetailRow>(
    `${queueSelect(",m.text,m.client_message_id")} WHERE m.id=$1 LIMIT 1`,
    [messageId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const [reviews, reports] = await Promise.all([
    pool.query<{
      id: string; source: string; action: string; reason: string | null; metadata: unknown;
      admin_user_id: string | null; created_at: Date;
    }>(`SELECT id,source,action,reason,metadata,admin_user_id,created_at
          FROM message_moderation_reviews WHERE message_id=$1 ORDER BY created_at,id`, [messageId]),
    pool.query<{
      id: string; reporter_user_id: string; reason: string; comment: string | null;
      status: string; created_at: Date;
    }>(`SELECT id,reporter_user_id,reason,comment,status,created_at FROM safety_reports
         WHERE target_type='message' AND target_id=$1 ORDER BY created_at,id`, [messageId]),
  ]);
  return {
    ...toQueueItem(row),
    text: row.text,
    clientMessageId: row.client_message_id,
    reviews: reviews.rows.map((item) => ({
      id: item.id,
      source: item.source,
      action: item.action,
      reason: item.reason,
      metadata: item.metadata as AdminMessageDetail["reviews"][number]["metadata"],
      adminUserId: item.admin_user_id,
      createdAt: item.created_at.toISOString(),
    })),
    reports: reports.rows.map((item) => ({
      id: item.id,
      reporterUserId: item.reporter_user_id,
      reason: item.reason,
      comment: item.comment,
      status: item.status,
      createdAt: item.created_at.toISOString(),
    })),
    privacyNote: "Only this selected moderation subject is exposed; surrounding conversation text is not included.",
  };
}

export async function applyMessageDecision(input: {
  messageId: string;
  adminUserId: string;
  action: AdminMessageDecision;
  reason: string | null;
}): Promise<{ previousState: MessageModerationState; nextState: MessageModerationState } | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ state: MessageModerationState; thread_id: string }>(
      `SELECT s.state,m.thread_id FROM message_moderation_states s
        JOIN messages m ON m.id=s.message_id WHERE s.message_id=$1 FOR UPDATE`,
      [input.messageId],
    );
    const row = current.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return undefined;
    }
    const nextState = stateForAction(input.action);
    await client.query(
      `UPDATE message_moderation_states SET state=$2,updated_at=now() WHERE message_id=$1`,
      [input.messageId, nextState],
    );
    await client.query(
      `INSERT INTO message_moderation_reviews(message_id,source,action,reason,metadata,admin_user_id)
       VALUES($1,'manual_admin',$2,$3,$4::jsonb,$5)`,
      [
        input.messageId,
        input.action,
        input.reason,
        JSON.stringify({ previousState: row.state, nextState }),
        input.adminUserId,
      ],
    );
    const latest = await client.query<{ id: string; text: string; created_at: Date }>(
      `SELECT m.id,m.text,m.created_at FROM messages m
        LEFT JOIN message_moderation_states s ON s.message_id=m.id
       WHERE m.thread_id=$1 AND COALESCE(s.state,'visible')='visible'
       ORDER BY m.created_at DESC,m.id DESC LIMIT 1`,
      [row.thread_id],
    );
    const visible = latest.rows[0];
    await client.query(
      `UPDATE threads SET last_message_at=$2,last_message_text=$3,updated_at=now() WHERE id=$1`,
      [row.thread_id, visible?.created_at ?? null, visible?.text ?? null],
    );
    await client.query("COMMIT");
    return { previousState: row.state, nextState };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function queueSelect(extra = ""): string {
  return `SELECT m.id,m.thread_id,s.source,s.state,s.automation_status,
    u.id sender_user_id,u.amoria_id sender_amoria_id,u.display_name sender_display_name,
    (SELECT count(*) FROM safety_reports sr WHERE sr.target_type='message' AND sr.target_id=m.id::text) report_count,
    (SELECT mr.reason FROM message_moderation_reviews mr WHERE mr.message_id=m.id
      ORDER BY mr.created_at DESC,mr.id DESC LIMIT 1) latest_reason,
    m.created_at,s.updated_at${extra}
    FROM messages m JOIN message_moderation_states s ON s.message_id=m.id
    JOIN users u ON u.id=m.from_user_id`;
}

function toQueueItem(row: QueueRow): AdminMessageQueueItem {
  return {
    id: row.id,
    threadId: row.thread_id,
    source: row.source,
    state: row.state,
    automationStatus: row.automation_status,
    sender: { id: row.sender_user_id, amoriaId: row.sender_amoria_id, displayName: row.sender_display_name },
    reportCount: Number(row.report_count),
    latestReason: row.latest_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function stateForAction(action: AdminMessageDecision): MessageModerationState {
  switch (action) {
    case "approve":
    case "restore":
      return "visible";
    case "restrict":
      return "restricted";
    case "remove":
      return "removed";
    case "escalate":
      return "needs_review";
  }
}
