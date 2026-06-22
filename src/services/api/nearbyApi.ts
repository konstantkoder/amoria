import { request } from "@/services/api/apiClient";
import type {
  NearbyActivityPreferencesResponse,
  NearbyFeedResponse,
  NearbyMeResponse,
  NearbyProfileFeedResponse,
  NearbyRoomActionResponse,
  NearbyRoomMessagesResponse,
  NearbyRoomOpenResponse,
  NearbyRoomsResponse,
  NearbySummaryResponse,
  NearbyStatusDto,
  SendNearbyRoomMessageResponse,
  PatchNearbyProfileStatusRequest,
  UpdateNearbyActivityPreferencesRequest,
  UpdateNearbyVisibilityRequest,
} from "@/services/api/types";

export type CreateNearbyStatusPayload = {
  text: string;
  lat: number;
  lng: number;
};

type CreateNearbyStatusResponse = {
  status: NearbyStatusDto;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }

  const value = query.toString();
  return value ? `?${value}` : "";
}

export async function createStatus(
  payload: CreateNearbyStatusPayload
): Promise<NearbyStatusDto> {
  const response = await request<CreateNearbyStatusResponse>(
    "POST",
    "/nearby/statuses",
    payload
  );
  return response.status;
}

export function listFeed(
  lat: number,
  lng: number,
  radiusMeters: number,
  limit = 30
): Promise<NearbyFeedResponse> {
  return request<NearbyFeedResponse>(
    "GET",
    `/nearby/statuses/feed${buildQuery({ lat, lng, radiusMeters, limit })}`
  );
}

export function getNearbyMe(): Promise<NearbyMeResponse> {
  return request<NearbyMeResponse>("GET", "/nearby/me");
}

export function getNearbySummary(): Promise<NearbySummaryResponse> {
  return request<NearbySummaryResponse>("GET", "/nearby/summary");
}

export function updateVisibility(
  payload: UpdateNearbyVisibilityRequest
): Promise<NearbyMeResponse> {
  return request<NearbyMeResponse>("PUT", "/nearby/me/visibility", payload);
}

export function patchProfileStatus(
  payload: PatchNearbyProfileStatusRequest
): Promise<NearbyMeResponse> {
  return request<NearbyMeResponse>("PATCH", "/nearby/me/status", payload);
}

export function getActivityPreferences(): Promise<NearbyActivityPreferencesResponse> {
  return request<NearbyActivityPreferencesResponse>(
    "GET",
    "/nearby/activity-preferences"
  );
}

export function updateActivityPreferences(
  preferences: UpdateNearbyActivityPreferencesRequest["preferences"]
): Promise<NearbyActivityPreferencesResponse> {
  return request<NearbyActivityPreferencesResponse>(
    "PUT",
    "/nearby/activity-preferences",
    { preferences } satisfies UpdateNearbyActivityPreferencesRequest
  );
}

export function listProfileFeed(limit = 30): Promise<NearbyProfileFeedResponse> {
  return request<NearbyProfileFeedResponse>(
    "GET",
    `/nearby/feed${buildQuery({ limit })}`
  );
}

export function listNearbyRooms(): Promise<NearbyRoomsResponse> {
  return request<NearbyRoomsResponse>("GET", "/nearby/rooms");
}

export function joinNearbyRoom(
  roomId: string
): Promise<NearbyRoomActionResponse> {
  return request<NearbyRoomActionResponse>(
    "POST",
    `/nearby/rooms/${encodeURIComponent(roomId)}/join`
  );
}

export function leaveNearbyRoom(
  roomId: string
): Promise<NearbyRoomActionResponse> {
  return request<NearbyRoomActionResponse>(
    "POST",
    `/nearby/rooms/${encodeURIComponent(roomId)}/leave`
  );
}

export function openNearbyRoom(
  roomId: string
): Promise<NearbyRoomOpenResponse> {
  return request<NearbyRoomOpenResponse>(
    "POST",
    `/nearby/rooms/${encodeURIComponent(roomId)}/open`
  );
}

export function listNearbyRoomMessages(
  roomId: string
): Promise<NearbyRoomMessagesResponse> {
  return request<NearbyRoomMessagesResponse>(
    "GET",
    `/nearby/rooms/${encodeURIComponent(roomId)}/messages`
  );
}

export function sendNearbyRoomMessage(
  roomId: string,
  text: string,
  clientMessageId: string
): Promise<SendNearbyRoomMessageResponse> {
  return request<SendNearbyRoomMessageResponse>(
    "POST",
    `/nearby/rooms/${encodeURIComponent(roomId)}/messages`,
    {
      text,
      clientMessageId,
    }
  );
}

export async function deleteStatus(id: string): Promise<{ ok: true }> {
  await request<unknown>(
    "DELETE",
    `/nearby/statuses/${encodeURIComponent(id)}`
  );

  return { ok: true };
}
