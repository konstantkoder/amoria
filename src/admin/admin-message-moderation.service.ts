import { AppError, validationError } from "../common/errors";
import * as auditService from "./admin-audit.service";
import * as repo from "./admin-message-moderation.repo";
import type {
  AdminMessageDecisionBody,
  AdminMessageDetail,
  AdminMessageQueueItem,
  AdminMessageQueueQuery,
} from "./admin-message-moderation.types";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type AdminMessageModerationDeps = {
  repo: Pick<typeof repo, "listMessageQueue" | "findMessageDetail" | "applyMessageDecision">;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminMessageModerationDeps = { repo, audit: auditService };
let deps = defaultDeps;

export function __setAdminMessageModerationDepsForTests(
  overrides: Partial<AdminMessageModerationDeps>,
): () => void {
  const previous = deps;
  deps = {
    repo: overrides.repo ?? deps.repo,
    audit: overrides.audit ?? deps.audit,
  };
  return () => {
    deps = previous;
  };
}

export async function listMessageQueue(
  admin: AdminContext,
  query: AdminMessageQueueQuery,
  context: AdminRequestContext,
): Promise<{ items: AdminMessageQueueItem[]; nextCursor: null }> {
  const items = await deps.repo.listMessageQueue(query);
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.messageModeration.list",
    targetType: "message_moderation_queue",
    metadata: { status: query.status, source: query.source ?? null, resultCount: items.length },
    ...context,
  });
  return { items, nextCursor: null };
}

export async function getMessageDetail(
  admin: AdminContext,
  messageId: string,
  reason: string,
  context: AdminRequestContext,
): Promise<{ message: AdminMessageDetail }> {
  assertSensitiveRole(admin);
  const message = await deps.repo.findMessageDetail(messageId);
  if (!message) throw new AppError("not_found", "Moderation message not found", 404);
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.messageModeration.privateMessage.read",
    targetType: "message",
    targetId: messageId,
    reason,
    metadata: { state: message.state, source: message.source, reportCount: message.reportCount },
    ...context,
  });
  return { message };
}

export async function decideMessage(
  admin: AdminContext,
  messageId: string,
  input: AdminMessageDecisionBody,
  context: AdminRequestContext,
): Promise<{ ok: true; state: string }> {
  assertSensitiveRole(admin);
  const reason = input.reason?.trim() || null;
  if (["restrict", "remove", "escalate", "approve", "restore"].includes(input.action) && !reason) {
    throw validationError("A moderation reason is required", { reason: "required" });
  }
  const result = await deps.repo.applyMessageDecision({
    messageId,
    adminUserId: admin.adminUser.id,
    action: input.action,
    reason,
  });
  if (!result) throw new AppError("not_found", "Moderation message not found", 404);
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.messageModeration.decision",
    targetType: "message",
    targetId: messageId,
    reason,
    metadata: { decision: input.action, previousState: result.previousState, nextState: result.nextState },
    ...context,
  });
  return { ok: true, state: result.nextState };
}

function assertSensitiveRole(admin: AdminContext): void {
  if (admin.adminUser.roles.includes("owner") || admin.adminUser.roles.includes("moderator")) return;
  throw new AppError("forbidden", "Only owner or moderator may access private message content", 403);
}
