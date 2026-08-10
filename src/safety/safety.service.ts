import { AppError, validationError } from "../common/errors";
import { findUserById } from "../users/users.repo";
import * as safetyRepo from "./safety.repo";
import { assertSafeText } from "../moderation/text-validation";
import type {
  BlockUserBody,
  BlockedUsersResponse,
  CreateSafetyReportBody,
  OkResponse,
} from "./safety.types";

export async function blockUser(userId: string, input: BlockUserBody): Promise<OkResponse> {
  if (input.blockedUserId === userId) {
    throw validationError("Cannot block yourself", {
      blockedUserId: "self",
    });
  }

  const blockedUser = await findUserById(input.blockedUserId);
  if (!blockedUser) {
    throw new AppError("not_found", "Blocked user not found", 404);
  }

  await safetyRepo.upsertBlockedUser(userId, input.blockedUserId);
  return { ok: true };
}

export async function unblockUser(userId: string, blockedUserId: string): Promise<OkResponse> {
  await safetyRepo.deleteBlockedUser(userId, blockedUserId);
  return { ok: true };
}

export async function listBlocks(userId: string): Promise<BlockedUsersResponse> {
  const rows = await safetyRepo.listBlockedUsers(userId);
  return {
    items: rows.map((row) => ({
      blockedUserId: row.blockedUserId,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function createReport(
  reporterUserId: string,
  input: CreateSafetyReportBody,
): Promise<OkResponse> {
  assertSafeText(input.reason, { field: "reason", maxUrls: 0 });
  if (input.comment) assertSafeText(input.comment, { field: "comment", maxUrls: 2 });

  if (input.targetType === "message") {
    const target = await safetyRepo.findReportableMessage(input.targetId, reporterUserId);
    if (!target) throw new AppError("not_found", "Message not found", 404);
    if (target.message.fromUserId === reporterUserId) {
      throw validationError("You cannot report your own message", { targetId: "own_message" });
    }
    await safetyRepo.createMessageSafetyReport({
      reporterUserId,
      messageId: target.message.id,
      targetOwnerUserId: target.message.fromUserId,
      reason: input.reason,
      comment: input.comment ?? null,
      source: target.threadType === "nearby_room" ? "nearby" : "direct",
    });
    return { ok: true };
  }

  if (input.targetOwnerUserId) {
    const targetOwner = await findUserById(input.targetOwnerUserId);
    if (!targetOwner) {
      throw new AppError("not_found", "Target owner user not found", 404);
    }
  }

  await safetyRepo.createSafetyReport({
    reporterUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetOwnerUserId: input.targetOwnerUserId ?? null,
    reason: input.reason,
    comment: input.comment ?? null,
  });

  return { ok: true };
}
