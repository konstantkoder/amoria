import { AppError, forbidden, validationError } from "../common/errors";
import * as chatService from "../chat/chat.service";
import * as announcementsRepo from "./announcements.repo";
import type { AnnouncementDetailsRow } from "./announcements.repo";
import type {
  AnnouncementDto,
  AnnouncementsListResponse,
  AnnouncementsQuery,
  CreateAnnouncementBody,
  OkResponse,
  RespondAnnouncementBody,
  RespondAnnouncementResponse,
} from "./announcements.types";

export async function listAnnouncements(
  userId: string,
  query: AnnouncementsQuery,
): Promise<AnnouncementsListResponse> {
  const rows = await announcementsRepo.listActiveAnnouncementDetails(userId, query.limit);
  return {
    items: rows.map((row) => toAnnouncementDto(row, userId)),
    nextCursor: null,
  };
}

export async function createAnnouncement(
  authorUserId: string,
  input: CreateAnnouncementBody,
): Promise<AnnouncementDto> {
  if (input.photoMediaId) {
    const media = await announcementsRepo.findOwnedMediaFile(input.photoMediaId, authorUserId);
    if (!media) {
      throw forbidden("Announcement photo does not belong to current user");
    }
  }

  const announcement = await announcementsRepo.createAnnouncement({
    authorUserId,
    title: input.title,
    description: input.description,
    category: input.category,
    placeLabel: input.placeLabel ?? null,
    photoMediaId: input.photoMediaId ?? null,
  });

  const row = await announcementsRepo.findAnnouncementDetails(announcement.id, authorUserId);
  if (!row) {
    throw new Error("Created announcement was not found");
  }

  return toAnnouncementDto(row, authorUserId);
}

export async function getAnnouncement(userId: string, announcementId: string): Promise<AnnouncementDto> {
  const row = await announcementsRepo.findAnnouncementDetails(announcementId, userId);
  if (!row) {
    throw new AppError("not_found", "Announcement not found", 404);
  }

  return toAnnouncementDto(row, userId);
}

export async function closeAnnouncement(
  userId: string,
  announcementId: string,
): Promise<OkResponse> {
  const announcement = await announcementsRepo.findAnnouncementById(announcementId);
  if (!announcement) {
    throw new AppError("not_found", "Announcement not found", 404);
  }

  if (announcement.authorUserId !== userId) {
    throw forbidden("Only the announcement author can close it");
  }

  await announcementsRepo.updateAnnouncementStatus(announcement.id, "closed");
  return { ok: true };
}

export async function respondToAnnouncement(
  userId: string,
  announcementId: string,
  input: RespondAnnouncementBody,
): Promise<RespondAnnouncementResponse> {
  const announcement = await announcementsRepo.findAnnouncementById(announcementId);
  if (!announcement) {
    throw new AppError("not_found", "Announcement not found", 404);
  }

  if (announcement.status !== "active") {
    throw new AppError("validation_error", "Announcement is not active", 409, {
      status: "not_active",
    });
  }

  if (announcement.authorUserId === userId) {
    throw validationError("Cannot respond to your own announcement", {
      announcementId: "own_announcement",
    });
  }

  const response = await announcementsRepo.createAnnouncementResponseIdempotent({
    announcementId,
    fromUserId: userId,
  });

  const result: RespondAnnouncementResponse = {
    respondedAt: response.createdAt.toISOString(),
  };

  if (!input.openDirectChat) {
    return result;
  }

  const threadResult = await chatService.openDirectThreadWithStatus(userId, {
    peerUserId: announcement.authorUserId,
    source: {
      type: "announcement",
      sourceId: announcement.id,
    },
  });

  return {
    ...result,
    threadId: threadResult.thread.id,
    threadStatus: threadResult.status,
  };
}

function toAnnouncementDto(row: AnnouncementDetailsRow, viewerUserId: string): AnnouncementDto {
  return {
    id: row.id,
    status: row.status as AnnouncementDto["status"],
    title: row.title,
    description: row.description,
    category: row.category,
    placeLabel: row.placeLabel,
    photoUrl: row.photoUrl,
    author: row.author,
    responseCount: row.responseCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isMine: row.authorUserId === viewerUserId,
    hasResponded: row.hasResponded,
  };
}
