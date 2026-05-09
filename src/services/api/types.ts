export type ApiErrorDetails = Record<string, string | string[]>;
export type ApiErrorFields = ApiErrorDetails;

export type ApiErrorResponse = {
  error: {
    code?: string;
    message: string;
    details?: ApiErrorDetails;
    fields?: ApiErrorDetails;
  };
};

export type ProfileGoal =
  | "relationship"
  | "dating"
  | "friendship"
  | "chat"
  | "unsure";

export type ProfileMood =
  | "romantic"
  | "playful"
  | "chill"
  | "curious"
  | "adventurous";

export type ProfilePhotoDto = {
  mediaId: string;
  url: string;
};

export type ProfilePhotoPatchDto = {
  mediaId: string;
};

export type BackendProfileFields = {
  goal?: ProfileGoal | null;
  mood?: ProfileMood | null;
  interests?: string[];
  photos?: ProfilePhotoDto[];
  flirtEnabled?: boolean;
  allowAdultMode?: boolean;
  mysteryMode?: boolean;
};

export type SelfUserProfileDto = {
  id: string;
  email: string;
  displayName: string;
  about: string | null;
  amoriaId: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
} & BackendProfileFields;

export type AuthUserDto = {
  id: string;
  email: string;
  displayName: string;
  amoriaId: string;
  avatarUrl: string | null;
  about?: string | null;
  createdAt?: string;
  updatedAt?: string;
} & BackendProfileFields;

export type RegisterRequest = {
  email: string;
  password: string;
  displayName: string;
};

export type PublicUserProfileDto = {
  id: string;
  displayName: string;
  about: string | null;
  amoriaId: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
} & Omit<BackendProfileFields, "allowAdultMode">;

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  expiresAt?: string;
  user: AuthUserDto;
};

export type CurrentUserResponse = SelfUserProfileDto;

export type MeResponse = SelfUserProfileDto;

export type PatchProfileRequest = {
  displayName?: string;
  about?: string | null;
  avatarUrl?: string | null;
  goal?: ProfileGoal | null;
  mood?: ProfileMood | null;
  interests?: string[];
  photos?: ProfilePhotoPatchDto[];
  flirtEnabled?: boolean;
  allowAdultMode?: boolean;
  mysteryMode?: boolean;
};

export type MediaDto = {
  id?: string;
  mediaId?: string;
  url?: string;
  publicUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
};

export type PrepareUploadRequest = {
  purpose: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
};

export type PrepareUploadResponse = {
  uploadId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type CompleteUploadRequest = {
  sizeBytes: number;
  checksumSha256?: string;
};

export type CompleteUploadResponse = {
  media: MediaDto;
};

export type AnnouncementDto = {
  id: string;
  status: string;
  title: string;
  description: string;
  category: string;
  placeLabel: string | null;
  photoUrl: string | null;
  author: { id: string; displayName: string; avatarUrl: string | null };
  responseCount: number;
  createdAt: string;
  updatedAt: string;
  isMine?: boolean;
  hasResponded?: boolean;
};

export type AnnouncementsListResponse = {
  items: AnnouncementDto[];
  nextCursor: string | null;
};

export type RespondAnnouncementResponse = {
  threadId?: string;
  threadStatus?: string;
  respondedAt: string;
};

export type BlockItemDto = {
  blockedUserId: string;
  createdAt: string;
};

export type BlocksResponse = {
  items: BlockItemDto[];
};

export type NearbyStatusDto = {
  id: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  text: string;
  distanceMeters: number;
  createdAt: string;
  expiresAt: string;
};

export type NearbyFeedResponse = {
  items: NearbyStatusDto[];
  nextCursor: string | null;
};

export type ThreadPeerDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ThreadSourceType = "announcement" | "nearby" | "together";

export type ThreadSourceDto = { type: ThreadSourceType | "play"; sourceId: string } | null;

export type ThreadDto = {
  id: string;
  type: "direct";
  peer: ThreadPeerDto;
  lastMessage: { id: string; text: string; createdAt: string } | null;
  unreadCount: number;
  source: ThreadSourceDto;
};

export type InboxResponse = {
  items: ThreadDto[];
  nextCursor: string | null;
};

export type MessageDto = {
  id: string;
  threadId: string;
  fromUserId: string;
  text: string;
  createdAt: string;
  clientMessageId: string;
};

export type MessagesResponse = {
  items: MessageDto[];
};

export type TogetherQueueEntry = {
  id: string;
  status: string;
  sessionId?: string;
  expiresAt: string;
};

export type TogetherQueueResponse = {
  entry: TogetherQueueEntry;
};

export type TogetherSessionStatus = "active" | "finished" | "abandoned" | "cancelled";

export type TogetherRevealOutcome =
  | "pending"
  | "open_open"
  | "open_skip"
  | "skip_skip"
  | "blocked";

export type TogetherSessionDto = {
  id: string;
  activity: string;
  status: TogetherSessionStatus;
  promptText: string;
  createdAt: string;
  endedAt?: string | null;
  endedReason?: string | null;
  deadlineAt?: string | null;
};

export type TogetherParticipantDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TogetherSessionResponse = {
  session: TogetherSessionDto;
  participants: TogetherParticipantDto[];
  stateVersion: number;
};

export type TogetherRevealResponse = {
  outcome: TogetherRevealOutcome;
  threadId?: string;
};

export type TogetherHistoryItem = {
  sessionId: string;
  activity: string;
  status?: TogetherSessionStatus;
  promptText: string;
  peer: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  outcome: TogetherRevealOutcome;
  createdAt: string;
  endedAt?: string | null;
  endedReason?: string | null;
};

export type TogetherHistoryResponse = {
  items: TogetherHistoryItem[];
  nextCursor: null;
};

export type AvatarUploadResponse = {
  avatarUrl: string;
  user: SelfUserProfileDto;
};

export type BackendUploadFile = {
  uri: string;
  name?: string;
  type?: string;
};
