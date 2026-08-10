import { AppError, forbidden } from "../common/errors";
import type { MessageRow, ThreadRow } from "../db/schema";
import * as activityPreferencesRepo from "./nearby-activity-preferences.repo";
import {
  type NearbyActivityPreferenceChecker,
  requireNearbyActivityPreferenceForRoom,
} from "./nearby-activity-participation";
import * as nearbyRoomsRepo from "./nearby-rooms.repo";
import * as roomChatRepo from "./nearby-room-chat.repo";
import { moderateMessage } from "../moderation/message-safety.service";
import type { ModeratedMessageRow } from "../moderation/message-moderation.types";
import type {
  NearbyRoomChatMessageDto,
  NearbyRoomMessagesQuery,
  NearbyRoomMessagesResponse,
  NearbyRoomOpenResponse,
  SendNearbyRoomMessageBody,
  SendNearbyRoomMessageResponse,
} from "./nearby-room-chat.types";

export type SendNearbyRoomMessageResult = {
  response: SendNearbyRoomMessageResponse;
  threadId: string;
  created: boolean;
  deliveryAllowed: boolean;
  recipientUserIds: string[];
};

type NearbyRoomChatServiceDeps = {
  now: () => Date;
  roomRepo: Pick<typeof nearbyRoomsRepo, "findNearbyRoomForUser">;
  activityPreferencesRepo: NearbyActivityPreferenceChecker;
  chatRepo: Pick<
    typeof roomChatRepo,
    | "addNearbyRoomThreadMember"
    | "createNearbyRoomMessageIdempotent"
    | "findOrCreateNearbyRoomThread"
    | "findSafeNearbyRoomThread"
    | "listNearbyRoomMessages"
    | "findNearbyRoomMessageByClientId"
    | "listAllowedNearbyRoomRecipientUserIds"
  >;
};

const defaultDeps: NearbyRoomChatServiceDeps = {
  now: () => new Date(),
  roomRepo: nearbyRoomsRepo,
  activityPreferencesRepo,
  chatRepo: roomChatRepo,
};

let deps: NearbyRoomChatServiceDeps = defaultDeps;

export function __setNearbyRoomChatServiceDepsForTests(
  overrides: Partial<NearbyRoomChatServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function openNearbyRoomChat(
  userId: string,
  roomId: string,
): Promise<NearbyRoomOpenResponse> {
  const room = await requireActiveRoomMember(userId, roomId);
  const thread = await deps.chatRepo.findOrCreateNearbyRoomThread(
    room.id,
    userId,
    deps.now(),
  );

  if (!thread) {
    throw forbidden("Nearby room chat is unavailable");
  }

  return toRoomChatInfo(room, thread);
}

export async function getNearbyRoomMessages(
  userId: string,
  roomId: string,
  query: NearbyRoomMessagesQuery,
): Promise<NearbyRoomMessagesResponse> {
  const room = await requireActiveRoomMember(userId, roomId);
  if (!room.threadId) {
    return { items: [] };
  }

  const thread = await deps.chatRepo.findSafeNearbyRoomThread(room.id, room.threadId);
  if (!thread) {
    return { items: [] };
  }

  await deps.chatRepo.addNearbyRoomThreadMember(thread.id, userId, deps.now());
  const messages = await deps.chatRepo.listNearbyRoomMessages(thread.id, query.limit, userId);

  return {
    items: messages.map((message) => toRoomMessageDto(room.id, message)),
  };
}

export async function sendNearbyRoomMessage(
  userId: string,
  roomId: string,
  input: SendNearbyRoomMessageBody,
): Promise<SendNearbyRoomMessageResult> {
  const room = await requireActiveRoomMember(userId, roomId);
  const thread = await deps.chatRepo.findOrCreateNearbyRoomThread(
    room.id,
    userId,
    deps.now(),
  );

  if (!thread) {
    throw forbidden("Nearby room chat is unavailable");
  }

  const existing = typeof deps.chatRepo.findNearbyRoomMessageByClientId === "function"
    ? await deps.chatRepo.findNearbyRoomMessageByClientId(thread.id, userId, input.clientMessageId)
    : undefined;
  if (existing) {
    return {
      response: { message: toRoomMessageDto(room.id, existing) },
      threadId: thread.id,
      created: false,
      deliveryAllowed: existing.moderationState === "visible",
      recipientUserIds: [],
    };
  }

  const moderation = await moderateMessage({
    messageIdHint: `${thread.id}:${input.clientMessageId}`,
    senderUserId: userId,
    threadId: thread.id,
    clientMessageId: input.clientMessageId,
    text: input.text,
    source: "nearby",
  });

  const result = await deps.chatRepo.createNearbyRoomMessageIdempotent({
    threadId: thread.id,
    fromUserId: userId,
    text: input.text,
    clientMessageId: input.clientMessageId,
    moderation,
    moderationSource: "nearby",
  });
  const resultModerationState = (result.message as Partial<ModeratedMessageRow>).moderationState ?? "visible";
  const recipientUserIds = resultModerationState === "visible" &&
    typeof deps.chatRepo.listAllowedNearbyRoomRecipientUserIds === "function"
    ? await deps.chatRepo.listAllowedNearbyRoomRecipientUserIds(room.id, thread.id, userId)
    : [userId];

  return {
    response: {
      message: toRoomMessageDto(room.id, result.message),
    },
    threadId: thread.id,
    created: result.created,
    deliveryAllowed: resultModerationState === "visible",
    recipientUserIds,
  };
}

async function requireActiveRoomMember(
  userId: string,
  roomId: string,
): Promise<nearbyRoomsRepo.NearbyRoomListRow> {
  const room = await deps.roomRepo.findNearbyRoomForUser(roomId, userId);
  if (!room) {
    throw new AppError("not_found", "Nearby room not found", 404);
  }

  if (room.status !== "active") {
    throw forbidden("Nearby room is not active");
  }

  if (room.roomTypeStatus !== "active" || !room.adminApproved) {
    throw forbidden("Nearby room type is not available");
  }

  await requireNearbyActivityPreferenceForRoom(
    deps.activityPreferencesRepo,
    userId,
    room.typeKey,
  );

  if (room.viewerMembershipStatus !== "active") {
    throw forbidden("Nearby room active membership is required");
  }

  return room;
}

function toRoomChatInfo(
  room: nearbyRoomsRepo.NearbyRoomListRow,
  thread: ThreadRow,
): NearbyRoomOpenResponse {
  return {
    roomId: room.id,
    threadId: thread.id,
    title: room.title,
  };
}

function toRoomMessageDto(roomId: string, message: MessageRow | ModeratedMessageRow): NearbyRoomChatMessageDto {
  const moderated = message as Partial<ModeratedMessageRow>;
  return {
    id: message.id,
    roomId,
    threadId: message.threadId,
    fromUserId: message.fromUserId,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    clientMessageId: message.clientMessageId,
    ...(moderated.moderationState
      ? {
          moderationState: moderated.moderationState,
          automationStatus: moderated.automationStatus ?? "not_required",
        }
      : {}),
  };
}
