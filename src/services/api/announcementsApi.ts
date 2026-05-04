import { request } from "@/services/api/apiClient";
import type {
  AnnouncementDto,
  AnnouncementsListResponse,
  RespondAnnouncementResponse,
} from "@/services/api/types";

export type CreateAnnouncementPayload = {
  title: string;
  description: string;
  category: string;
  placeLabel?: string | null;
  photoMediaId?: string;
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

export function listAnnouncements(limit = 30): Promise<AnnouncementsListResponse> {
  return request<AnnouncementsListResponse>(
    "GET",
    `/announcements${buildQuery({ limit })}`
  );
}

export function createAnnouncement(
  payload: CreateAnnouncementPayload
): Promise<AnnouncementDto> {
  return request<AnnouncementDto>("POST", "/announcements", payload);
}

export function getAnnouncement(id: string): Promise<AnnouncementDto> {
  return request<AnnouncementDto>(
    "GET",
    `/announcements/${encodeURIComponent(id)}`
  );
}

export function closeAnnouncement(id: string): Promise<AnnouncementDto> {
  return request<AnnouncementDto>(
    "POST",
    `/announcements/${encodeURIComponent(id)}/close`
  );
}

export function respondAndOpenChat(
  id: string
): Promise<RespondAnnouncementResponse> {
  return request<RespondAnnouncementResponse>(
    "POST",
    `/announcements/${encodeURIComponent(id)}/respond`,
    { openDirectChat: true }
  );
}
