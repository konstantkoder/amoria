import { request } from "@/services/api/apiClient";
import type { NearbyFeedResponse, NearbyStatusDto } from "@/services/api/types";

export type CreateNearbyStatusPayload = {
  text: string;
  lat: number;
  lng: number;
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

export function createStatus(
  payload: CreateNearbyStatusPayload
): Promise<NearbyStatusDto> {
  return request<NearbyStatusDto>("POST", "/nearby/statuses", payload);
}

export function listFeed(
  lat: number,
  lng: number,
  radiusMeters: number,
  limit = 30
): Promise<NearbyFeedResponse> {
  return request<NearbyFeedResponse>(
    "GET",
    `/nearby/feed${buildQuery({ lat, lng, radiusMeters, limit })}`
  );
}

export async function deleteStatus(id: string): Promise<{ ok: true }> {
  await request<unknown>(
    "DELETE",
    `/nearby/statuses/${encodeURIComponent(id)}`
  );

  return { ok: true };
}
