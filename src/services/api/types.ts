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

export type AgeGroup = "18-24" | "25-34" | "35-44" | "45-54" | "55+";

export type ProfileGender = "woman" | "man" | "nonbinary";

export type ProfilePhotoDto = {
  mediaId: string;
  url: string;
  position?: number;
  visibility?: "public" | "locked";
};

export type ProfilePhotoPatchDto = {
  mediaId: string;
};

export type BackendProfileFields = {
  gender?: ProfileGender | null;
  preferredGenders?: ProfileGender[];
  goal?: ProfileGoal | null;
  mood?: ProfileMood | null;
  interests?: string[];
  photos?: ProfilePhotoDto[];
  birthDate?: string | null;
  age?: number | null;
  ageGroup?: AgeGroup | null;
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
  /** @deprecated Legacy standalone Flirt flag. Not age verification and not used for Together matching. */
  flirtEnabled?: boolean;
  /** @deprecated Legacy standalone 18+ flag. Not age verification and not used for Together matching. */
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
  photos: ProfilePhotoDto[];
  goal: ProfileGoal | null;
  mood: ProfileMood | null;
  interests: string[];
  ageGroup?: AgeGroup | null;
  lockedGallery: LockedGallerySummaryDto;
};

export type ProfileGalleryVisibility = "public" | "locked";

export type ProfileGalleryPhotoDto = {
  mediaId: string;
  url: string;
  position: number;
  galleryItemId?: string;
  visibility?: ProfileGalleryVisibility;
  mimeType?: string;
  moderationStatus?: string | null;
};

export type LockedGallerySummaryDto = {
  enabled: boolean;
  count: number;
};

export type OwnerProfileGalleryResponse = {
  publicPhotos: (ProfileGalleryPhotoDto & { visibility: "public" })[];
  lockedPhotos: (ProfileGalleryPhotoDto & { visibility: "locked" })[];
  lockedFolderEnabled: boolean;
  lockedPhotosCount: number;
  visibleImagesCount: number;
  minVisibleImagesRequired: number;
  maxProfileGalleryPhotos: number;
  maxLockedProfilePhotos: number;
};

export type UpdateProfileGalleryItemsRequest = {
  items: {
    mediaId: string;
    visibility: ProfileGalleryVisibility;
    position?: number;
  }[];
};

export type SetLockedGalleryPasswordRequest = {
  currentAccountPassword: string;
  newFolderPassword: string;
};

export type ResetLockedGalleryPasswordRequest = {
  currentAccountPassword: string;
};

export type UnlockLockedGalleryResponse = {
  photos: ProfileGalleryPhotoDto[];
  unlockToken: string;
  unlockExpiresAt: string;
};

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
  gender?: ProfileGender | null;
  preferredGenders?: ProfileGender[];
  goal?: ProfileGoal | null;
  mood?: ProfileMood | null;
  interests?: string[];
  photos?: ProfilePhotoPatchDto[];
  birthDate?: string | null;
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
  /** @deprecated Legacy standalone Flirt flag. Release UI must not send this. */
  flirtEnabled?: boolean;
  /** @deprecated Legacy standalone 18+ flag. Release UI must not send this. */
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

export type NearbyProfileVisibilityStatus = "active" | "off" | "expired";

export type NearbyProfileStatusKind =
  | "coffee"
  | "walk"
  | "bike"
  | "talk_now"
  | "open_to_suggestions";

export type NearbyProfileDistanceBucket =
  | "under_1km"
  | "1_5km"
  | "5_25km"
  | "25_100km"
  | "over_100km";

export type NearbyProfileVisibilityDto = {
  status: NearbyProfileVisibilityStatus;
  radiusKm: number | null;
  nearbyStatus: string | null;
  statusKind: NearbyProfileStatusKind | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

export type NearbyMeResponse = {
  visibility: NearbyProfileVisibilityDto;
};

export type NearbySummaryResponse = {
  totalUsersCount: number;
  onlineNowCount: number;
  activeNearbyCount: number;
  checkedAt: string;
};

export type UpdateNearbyVisibilityRequest = {
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  nearbyStatus?: string | null;
  statusKind?: NearbyProfileStatusKind | null;
  expiresInSec?: number;
};

export type PatchNearbyProfileStatusRequest = {
  nearbyStatus?: string | null;
  statusKind?: NearbyProfileStatusKind | null;
  expiresInSec?: number;
};

export type NearbyActivityKey =
  | "coffee_nearby"
  | "walk_nearby"
  | "bike_nearby"
  | "cinema_today"
  | "talk_nearby"
  | "evening_nearby"
  | "roller_skating_nearby"
  | "kayaking_nearby"
  | "fishing_nearby"
  | "sport_nearby"
  | "language_exchange_nearby"
  | "local_event_nearby"
  | "lunch_nearby"
  | "dinner_nearby"
  | "dessert_nearby"
  | "board_games_nearby"
  | "chess_nearby"
  | "book_club_nearby"
  | "study_work_nearby"
  | "skateboarding_nearby"
  | "running_nearby"
  | "gym_nearby"
  | "yoga_nearby"
  | "dance_nearby"
  | "football_nearby"
  | "basketball_nearby"
  | "volleyball_nearby"
  | "tennis_nearby"
  | "table_tennis_nearby"
  | "badminton_nearby"
  | "beach_swim_nearby"
  | "picnic_nearby"
  | "hiking_nearby"
  | "dog_walk_nearby"
  | "concert_nearby"
  | "museum_exhibition_nearby"
  | "theater_nearby"
  | "live_music_nearby"
  | "festival_nearby"
  | "photography_nearby"
  | "cooking_nearby"
  | "volunteering_nearby"
  | "gaming_nearby";

export type NearbyActivityCategory =
  | "social"
  | "movement"
  | "team_sports"
  | "nature_water"
  | "culture_events"
  | "hobbies";

export type NearbyActivityDefinition = {
  activityKey: NearbyActivityKey;
  title: string;
  category: NearbyActivityCategory;
  sortOrder: number;
};

export type NearbyActivityPreference = {
  activityKey: NearbyActivityKey;
  status: "active" | "disabled";
  geoBucket: string | null;
  source: "nearby_questionnaire";
  updatedAt: string;
};

export type NearbyActivityPreferencesResponse = {
  availableActivities: NearbyActivityDefinition[];
  preferences: NearbyActivityPreference[];
};

export type UpdateNearbyActivityPreferencesRequest = {
  preferences: Array<{
    activityKey: NearbyActivityKey;
    geoBucket?: string | null;
  }>;
};

export type NearbyProfilePhotoPreviewDto = {
  mediaId: string;
  url: string;
};

export type NearbyProfileFeedItemDto = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  age: number | null;
  ageGroup: AgeGroup | null;
  distanceBucket: NearbyProfileDistanceBucket;
  goal: ProfileGoal | null;
  mood: ProfileMood | null;
  interests: string[];
  publicPhotos: NearbyProfilePhotoPreviewDto[];
  nearbyStatus: string | null;
  statusKind: NearbyProfileStatusKind | null;
  canMessage: boolean;
};

export type NearbyProfileFeedResponse = {
  items: NearbyProfileFeedItemDto[];
  nextCursor: string | null;
};

export type NearbyRoomCard = {
  id: string;
  typeKey: string;
  title: string;
  geoBucket: string;
  locationLabel: string | null;
  startsAt: string | null;
  memberCount: number;
  status: string;
  canJoin: boolean;
  canOpen: boolean;
  threadId: string | null;
};

export type NearbyRoomsResponse = {
  items: NearbyRoomCard[];
  nextCursor: null;
};

export type NearbyRoomActionResponse = {
  room: NearbyRoomCard;
};

export type NearbyRoomOpenResponse = {
  roomId: string;
  threadId: string;
  title: string;
};

export type NearbyRoomMessage = {
  id: string;
  roomId: string;
  threadId: string;
  fromUserId: string;
  text: string;
  createdAt: string;
  clientMessageId: string;
};

export type NearbyRoomMessagesResponse = {
  items: NearbyRoomMessage[];
};

export type SendNearbyRoomMessageResponse = {
  message: NearbyRoomMessage;
};

export type ThreadPeerDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ThreadSourceType = "announcement" | "nearby" | "together";

export type ThreadSourceDto = { type: ThreadSourceType | "play"; sourceId: string } | null;

export type ThreadContextDto = {
  id: string;
  sourceType: ThreadSourceType | "play";
  sourceId: string;
  metadata: unknown | null;
  createdAt: string;
};

export type ThreadDto = {
  id: string;
  type: "direct";
  peer: ThreadPeerDto;
  lastMessage: { id: string; text: string; createdAt: string } | null;
  unreadCount: number;
  source: ThreadSourceDto;
  contexts?: ThreadContextDto[];
};

export type ThreadResponse = {
  thread: ThreadDto;
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

export type MessageResponse = {
  message: MessageDto;
};

export type MessagesResponse = {
  items: MessageDto[];
};

export type TogetherQueueEntry = {
  id: string;
  status: string;
  sessionId?: string;
  createdAt: string;
  expiresAt: string;
  cancelledAt?: string | null;
  cancelSource?: TogetherQueueCancelSource | null;
};

export type TogetherActivity = "draw" | "story_sparks";

export type TogetherQueueCancelSource =
  | "user_stop"
  | "user_back"
  | "retry_restart"
  | "radius_expansion"
  | "screen_cleanup"
  | "navigation_blur"
  | "admin_cancel"
  | "server_expired"
  | "matched"
  | "unknown";

export type TogetherQueueCancelInput = {
  cancelSource: TogetherQueueCancelSource;
  cancelReason?: string;
};

export type TogetherQueueLocationInput = {
  latitude: number;
  longitude: number;
  radiusKm: 5 | 25 | 100 | 250 | null;
};

export type TogetherPreferredAgeRangeInput = {
  min: number;
  max: number | null;
};

export type TogetherQueueResponse = {
  entry: TogetherQueueEntry;
};

export type TogetherEventType = "stroke_batch" | "story_choice" | "system";

export type TogetherEventDto = {
  id: string;
  sessionId: string;
  fromUserId: string;
  clientEventId: string;
  type: TogetherEventType;
  payload: unknown;
  createdAt: string;
};

export type TogetherSessionEventsResponse = {
  items: TogetherEventDto[];
  nextCursor: null;
};

export type TogetherSessionStatus = "active" | "finished" | "abandoned" | "cancelled";

export type TogetherRevealOutcome =
  | "pending"
  | "open_open"
  | "open_skip"
  | "skip_skip"
  | "continue_story"
  | "mixed_intent"
  | "blocked";

export type TogetherRevealDecision = "open" | "skip" | "continue_story";

export type TogetherRevealStateDto = {
  myDecision: TogetherRevealDecision | null;
  outcome: TogetherRevealOutcome;
  threadId: string | null;
  canOpenChat: boolean;
  peerDecisionKnown: boolean;
  nextSessionId: string | null;
  nextActivity: TogetherActivity | null;
};

export type StorySparksLanguage = "ru" | "en" | "hr";

export type StorySparksTranslation = Record<StorySparksLanguage, string>;

export type StorySparksRoundId = "place" | "detail" | "twist" | "ending";

export type StorySparksCardDto = {
  id: string;
  round: StorySparksRoundId;
  title: StorySparksTranslation;
  subtitle?: StorySparksTranslation;
  emoji: string;
  toneTags?: string[];
};

export type StorySparksRoundDto = {
  id: StorySparksRoundId;
  title: StorySparksTranslation;
  cards: StorySparksCardDto[];
};

export type StorySparksPackDto = {
  packId: string;
  version: number;
  rounds: StorySparksRoundDto[];
};

export type StorySparksChoicePayload = {
  roundId: StorySparksRoundId;
  cardId: string;
  packId: string;
  clientRoundIndex: number;
};

export type StorySparksArtifactChoiceDto = StorySparksChoicePayload & {
  fromUserId: string;
  card: StorySparksCardDto;
  createdAt: string;
};

export type StorySparksArtifactRoundDto = {
  roundId: StorySparksRoundId;
  title: StorySparksTranslation;
  choices: StorySparksArtifactChoiceDto[];
};

export type StorySparksArtifactDto = {
  packId: string;
  version: number;
  title: StorySparksTranslation;
  summary: StorySparksTranslation;
  rounds: StorySparksArtifactRoundDto[];
};

export type TogetherSessionDto = {
  id: string;
  activity: TogetherActivity;
  status: TogetherSessionStatus;
  promptText: string;
  promptKey?: string | null;
  createdAt: string;
  endedAt?: string | null;
  endedReason?: string | null;
  deadlineAt?: string | null;
  sourceSessionId?: string | null;
  storyPack?: StorySparksPackDto;
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
  revealState?: TogetherRevealStateDto;
};

export type TogetherRevealResponse = {
  outcome: TogetherRevealOutcome;
  threadId?: string;
  nextSessionId?: string;
  nextActivity?: TogetherActivity;
  revealState: TogetherRevealStateDto;
};

export type TogetherHistoryItem = {
  sessionId: string;
  activity: TogetherActivity;
  status?: TogetherSessionStatus;
  promptText: string;
  promptKey?: string | null;
  peer: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  outcome: TogetherRevealOutcome;
  myDecision?: TogetherRevealDecision | null;
  threadId?: string | null;
  canOpenChat?: boolean;
  peerDecisionKnown?: boolean;
  nextSessionId?: string | null;
  nextActivity?: TogetherActivity | null;
  createdAt: string;
  endedAt?: string | null;
  endedReason?: string | null;
  storyArtifact?: StorySparksArtifactDto;
};

export type TogetherHistoryResponse = {
  items: TogetherHistoryItem[];
  nextCursor: null;
};

export type AvatarUploadResponse = {
  avatarUrl: string;
  user: SelfUserProfileDto;
};

export type MediaCropDto = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BackendUploadFile = {
  uri: string;
  name?: string;
  type?: string;
};
