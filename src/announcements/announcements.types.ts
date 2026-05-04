export type AnnouncementStatus = "active" | "closed" | "deleted" | "under_review";

export type AnnouncementAuthorDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type AnnouncementDto = {
  id: string;
  status: AnnouncementStatus;
  title: string;
  description: string;
  category: string;
  placeLabel: string | null;
  photoUrl: string | null;
  author: AnnouncementAuthorDto;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
  isMine?: boolean;
  hasResponded?: boolean;
};

export type AnnouncementsQuery = {
  limit: number;
};

export type CreateAnnouncementBody = {
  title: string;
  description: string;
  category: string;
  placeLabel?: string;
  photoMediaId?: string;
};

export type RespondAnnouncementBody = {
  openDirectChat: boolean;
};

export type AnnouncementsListResponse = {
  items: AnnouncementDto[];
  nextCursor: null;
};

export type RespondAnnouncementResponse = {
  respondedAt: string;
  threadId?: string;
  threadStatus?: "created" | "existing";
};

export type OkResponse = {
  ok: true;
};
