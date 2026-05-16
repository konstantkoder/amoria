import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 40 }).notNull(),
  about: text("about"),
  amoriaId: varchar("amoria_id", { length: 16 }).notNull().unique(),
  avatarUrl: text("avatar_url"),
  photos: jsonb("photos").$type<ProfilePhoto[]>().default(sql`'[]'::jsonb`).notNull(),
  goal: text("goal"),
  mood: text("mood"),
  interests: jsonb("interests").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  flirtEnabled: boolean("flirt_enabled").default(false).notNull(),
  allowAdultMode: boolean("allow_adult_mode").default(false).notNull(),
  mysteryMode: boolean("mystery_mode").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaFiles = pgTable("media_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  path: text("path").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  checksumSha256: text("checksum_sha256"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaUploads = pgTable("media_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksumSha256: text("checksum_sha256"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const profileGalleryItems = pgTable(
  "profile_gallery_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("profile_gallery_items_user_media_unique").on(table.userId, table.mediaId),
    index("profile_gallery_items_user_visibility_idx").on(table.userId, table.visibility),
    check(
      "profile_gallery_items_visibility_check",
      sql`${table.visibility} IN ('public', 'locked')`,
    ),
  ],
);

export const profileLockedGallerySettings = pgTable("profile_locked_gallery_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash"),
  passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    email: text("email"),
    displayName: text("display_name"),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("admin_users_status_check", sql`${table.status} IN ('active', 'disabled')`),
  ],
);

export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminUserRoles = pgTable(
  "admin_user_roles",
  {
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => adminRoles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.adminUserId, table.roleId] })],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<JsonValue | null>(),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_log_created_at_idx").on(table.createdAt),
    index("admin_audit_log_admin_user_created_at_idx").on(table.adminUserId, table.createdAt),
  ],
);

export const clientErrorReports = pgTable(
  "client_error_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    amoriaId: text("amoria_id"),
    displayName: text("display_name"),
    email: text("email"),
    screen: text("screen").notNull(),
    action: text("action").notNull(),
    step: text("step"),
    code: text("code"),
    message: text("message").notNull(),
    stack: text("stack"),
    metadata: jsonb("metadata").$type<JsonValue | null>(),
    platform: text("platform"),
    appVersion: text("app_version"),
    buildNumber: text("build_number"),
    deviceModel: text("device_model"),
    osVersion: text("os_version"),
    requestId: text("request_id"),
    backendUrl: text("backend_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("client_error_reports_created_at_idx").on(table.createdAt),
    index("client_error_reports_user_id_idx").on(table.userId),
    index("client_error_reports_amoria_id_idx").on(table.amoriaId),
    index("client_error_reports_screen_idx").on(table.screen),
    index("client_error_reports_action_idx").on(table.action),
    index("client_error_reports_code_idx").on(table.code),
  ],
);

export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("active").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  placeLabel: text("place_label"),
  photoMediaId: uuid("photo_media_id").references(() => mediaFiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const announcementResponses = pgTable(
  "announcement_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("announcement_responses_announcement_from_unique").on(
      table.announcementId,
      table.fromUserId,
    ),
  ],
);

export const blockedUsers = pgTable(
  "blocked_users",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.blockedUserId] })],
);

export const safetyReports = pgTable("safety_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterUserId: uuid("reporter_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  targetOwnerUserId: uuid("target_owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reason: text("reason").notNull(),
  comment: text("comment"),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("safety_reports_status_created_at_idx").on(table.status, table.createdAt),
  index("safety_reports_target_type_idx").on(table.targetType),
  index("safety_reports_reporter_idx").on(table.reporterUserId),
  index("safety_reports_target_owner_idx").on(table.targetOwnerUserId),
  check(
    "safety_reports_status_check",
    sql`${table.status} IN ('open', 'under_review', 'resolved', 'dismissed', 'escalated')`,
  ),
]);

export const reportReviewActions = pgTable("report_review_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => safetyReports.id, { onDelete: "cascade" }),
  adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  reason: text("reason"),
  note: text("note"),
  metadata: jsonb("metadata").$type<JsonValue | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("report_review_actions_report_created_at_idx").on(table.reportId, table.createdAt),
  index("report_review_actions_admin_user_idx").on(table.adminUserId),
  check(
    "report_review_actions_action_check",
    sql`${table.action} IN ('assign', 'mark_under_review', 'dismiss', 'resolve', 'escalate', 'add_note')`,
  ),
]);

export const mediaModerationReviews = pgTable("media_moderation_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => mediaFiles.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<JsonValue | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("media_moderation_reviews_media_created_at_idx").on(table.mediaId, table.createdAt),
  index("media_moderation_reviews_owner_idx").on(table.ownerUserId),
  index("media_moderation_reviews_admin_user_idx").on(table.adminUserId),
  check(
    "media_moderation_reviews_action_check",
    sql`${table.action} IN ('approve', 'restrict', 'remove', 'mark_under_review')`,
  ),
]);

export const nearbyStatuses = pgTable("nearby_statuses", {
  id: uuid("id").defaultRandom().primaryKey(),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radiusMeters: integer("radius_meters").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const togetherSessions = pgTable("together_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  activity: text("activity").notNull(),
  status: text("status").default("active").notNull(),
  promptText: text("prompt_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  endedReason: text("ended_reason"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const togetherQueue = pgTable(
  "together_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activity: text("activity").default("draw").notNull(),
    status: text("status").default("waiting").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    matchedSessionId: uuid("matched_session_id").references(() => togetherSessions.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("together_queue_user_waiting_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'waiting'`),
  ],
);

export const togetherSessionMembers = pgTable(
  "together_session_members",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => togetherSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.userId] })],
);

export const togetherEvents = pgTable(
  "together_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => togetherSessions.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientEventId: text("client_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<JsonValue>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("together_events_session_from_client_unique").on(
      table.sessionId,
      table.fromUserId,
      table.clientEventId,
    ),
  ],
);

export const togetherReveals = pgTable(
  "together_reveals",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => togetherSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("together_reveals_session_user_unique").on(table.sessionId, table.userId),
  ],
);

export const threads = pgTable("threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  sourceType: text("source_type"),
  sourceId: uuid("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessageText: text("last_message_text"),
});

export const directThreadPairs = pgTable(
  "direct_thread_pairs",
  {
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" })
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userAId, table.userBId] }),
  ],
);

export const threadMembers = pgTable(
  "thread_members",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.userId] })],
);

export const threadContexts = pgTable(
  "thread_contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    metadata: jsonb("metadata").$type<JsonValue | null>(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("thread_contexts_thread_source_unique").on(
      table.threadId,
      table.sourceType,
      table.sourceId,
    ),
    index("thread_contexts_thread_id_idx").on(table.threadId),
    index("thread_contexts_source_idx").on(table.sourceType, table.sourceId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    clientMessageId: text("client_message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("messages_thread_from_client_message_unique").on(
      table.threadId,
      table.fromUserId,
      table.clientMessageId,
    ),
  ],
);

export const threadReads = pgTable(
  "thread_reads",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
    lastReadMessageId: uuid("last_read_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.userId] })],
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedByTokenId: uuid("replaced_by_token_id"),
  deviceId: text("device_id"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  mediaFiles: many(mediaFiles),
  mediaUploads: many(mediaUploads),
  adminUsers: many(adminUsers),
  clientErrorReports: many(clientErrorReports),
  announcements: many(announcements),
  announcementResponses: many(announcementResponses),
  blockedUsers: many(blockedUsers, { relationName: "blocker" }),
  blockedByUsers: many(blockedUsers, { relationName: "blocked" }),
  safetyReports: many(safetyReports, { relationName: "reporter" }),
  ownedSafetyReports: many(safetyReports, { relationName: "target_owner" }),
  nearbyStatuses: many(nearbyStatuses),
  togetherQueueEntries: many(togetherQueue),
  togetherSessionMembers: many(togetherSessionMembers),
  togetherEvents: many(togetherEvents),
  togetherReveals: many(togetherReveals),
  threadMembers: many(threadMembers),
  messages: many(messages),
  threadReads: many(threadReads),
  refreshTokens: many(refreshTokens),
}));

export const adminUsersRelations = relations(adminUsers, ({ one, many }) => ({
  user: one(users, {
    fields: [adminUsers.userId],
    references: [users.id],
  }),
  roles: many(adminUserRoles),
  auditLog: many(adminAuditLog),
}));

export const adminRolesRelations = relations(adminRoles, ({ many }) => ({
  adminUsers: many(adminUserRoles),
}));

export const adminUserRolesRelations = relations(adminUserRoles, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [adminUserRoles.adminUserId],
    references: [adminUsers.id],
  }),
  role: one(adminRoles, {
    fields: [adminUserRoles.roleId],
    references: [adminRoles.id],
  }),
}));

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [adminAuditLog.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const clientErrorReportsRelations = relations(clientErrorReports, ({ one }) => ({
  user: one(users, {
    fields: [clientErrorReports.userId],
    references: [users.id],
  }),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one, many }) => ({
  owner: one(users, {
    fields: [mediaFiles.ownerUserId],
    references: [users.id],
  }),
  photoAnnouncements: many(announcements),
  moderationReviews: many(mediaModerationReviews),
}));

export const mediaUploadsRelations = relations(mediaUploads, ({ one }) => ({
  owner: one(users, {
    fields: [mediaUploads.ownerUserId],
    references: [users.id],
  }),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  author: one(users, {
    fields: [announcements.authorUserId],
    references: [users.id],
  }),
  photo: one(mediaFiles, {
    fields: [announcements.photoMediaId],
    references: [mediaFiles.id],
  }),
  responses: many(announcementResponses),
}));

export const announcementResponsesRelations = relations(announcementResponses, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementResponses.announcementId],
    references: [announcements.id],
  }),
  fromUser: one(users, {
    fields: [announcementResponses.fromUserId],
    references: [users.id],
  }),
}));

export const blockedUsersRelations = relations(blockedUsers, ({ one }) => ({
  user: one(users, {
    fields: [blockedUsers.userId],
    references: [users.id],
    relationName: "blocker",
  }),
  blockedUser: one(users, {
    fields: [blockedUsers.blockedUserId],
    references: [users.id],
    relationName: "blocked",
  }),
}));

export const safetyReportsRelations = relations(safetyReports, ({ one }) => ({
  reporter: one(users, {
    fields: [safetyReports.reporterUserId],
    references: [users.id],
    relationName: "reporter",
  }),
  targetOwner: one(users, {
    fields: [safetyReports.targetOwnerUserId],
    references: [users.id],
    relationName: "target_owner",
  }),
}));

export const reportReviewActionsRelations = relations(reportReviewActions, ({ one }) => ({
  report: one(safetyReports, {
    fields: [reportReviewActions.reportId],
    references: [safetyReports.id],
  }),
  adminUser: one(adminUsers, {
    fields: [reportReviewActions.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const mediaModerationReviewsRelations = relations(mediaModerationReviews, ({ one }) => ({
  media: one(mediaFiles, {
    fields: [mediaModerationReviews.mediaId],
    references: [mediaFiles.id],
  }),
  owner: one(users, {
    fields: [mediaModerationReviews.ownerUserId],
    references: [users.id],
  }),
  adminUser: one(adminUsers, {
    fields: [mediaModerationReviews.adminUserId],
    references: [adminUsers.id],
  }),
}));

export const nearbyStatusesRelations = relations(nearbyStatuses, ({ one }) => ({
  author: one(users, {
    fields: [nearbyStatuses.authorUserId],
    references: [users.id],
  }),
}));

export const togetherSessionsRelations = relations(togetherSessions, ({ many }) => ({
  queueEntries: many(togetherQueue),
  members: many(togetherSessionMembers),
  events: many(togetherEvents),
  reveals: many(togetherReveals),
}));

export const togetherQueueRelations = relations(togetherQueue, ({ one }) => ({
  user: one(users, {
    fields: [togetherQueue.userId],
    references: [users.id],
  }),
  matchedSession: one(togetherSessions, {
    fields: [togetherQueue.matchedSessionId],
    references: [togetherSessions.id],
  }),
}));

export const togetherSessionMembersRelations = relations(
  togetherSessionMembers,
  ({ one }) => ({
    session: one(togetherSessions, {
      fields: [togetherSessionMembers.sessionId],
      references: [togetherSessions.id],
    }),
    user: one(users, {
      fields: [togetherSessionMembers.userId],
      references: [users.id],
    }),
  }),
);

export const togetherEventsRelations = relations(togetherEvents, ({ one }) => ({
  session: one(togetherSessions, {
    fields: [togetherEvents.sessionId],
    references: [togetherSessions.id],
  }),
  fromUser: one(users, {
    fields: [togetherEvents.fromUserId],
    references: [users.id],
  }),
}));

export const togetherRevealsRelations = relations(togetherReveals, ({ one }) => ({
  session: one(togetherSessions, {
    fields: [togetherReveals.sessionId],
    references: [togetherSessions.id],
  }),
  user: one(users, {
    fields: [togetherReveals.userId],
    references: [users.id],
  }),
}));

export const threadsRelations = relations(threads, ({ many }) => ({
  members: many(threadMembers),
  directPair: many(directThreadPairs),
  contexts: many(threadContexts),
  messages: many(messages),
  reads: many(threadReads),
}));

export const directThreadPairsRelations = relations(directThreadPairs, ({ one }) => ({
  userA: one(users, {
    fields: [directThreadPairs.userAId],
    references: [users.id],
  }),
  userB: one(users, {
    fields: [directThreadPairs.userBId],
    references: [users.id],
  }),
  thread: one(threads, {
    fields: [directThreadPairs.threadId],
    references: [threads.id],
  }),
}));

export const threadMembersRelations = relations(threadMembers, ({ one }) => ({
  thread: one(threads, {
    fields: [threadMembers.threadId],
    references: [threads.id],
  }),
  user: one(users, {
    fields: [threadMembers.userId],
    references: [users.id],
  }),
}));

export const threadContextsRelations = relations(threadContexts, ({ one }) => ({
  thread: one(threads, {
    fields: [threadContexts.threadId],
    references: [threads.id],
  }),
  createdByUser: one(users, {
    fields: [threadContexts.createdByUserId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, {
    fields: [messages.threadId],
    references: [threads.id],
  }),
  fromUser: one(users, {
    fields: [messages.fromUserId],
    references: [users.id],
  }),
}));

export const threadReadsRelations = relations(threadReads, ({ one }) => ({
  thread: one(threads, {
    fields: [threadReads.threadId],
    references: [threads.id],
  }),
  user: one(users, {
    fields: [threadReads.userId],
    references: [users.id],
  }),
  lastReadMessage: one(messages, {
    fields: [threadReads.lastReadMessageId],
    references: [messages.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type MediaFileRow = typeof mediaFiles.$inferSelect;
export type NewMediaFileRow = typeof mediaFiles.$inferInsert;
export type MediaUploadRow = typeof mediaUploads.$inferSelect;
export type NewMediaUploadRow = typeof mediaUploads.$inferInsert;
export type ProfileGalleryItemRow = typeof profileGalleryItems.$inferSelect;
export type NewProfileGalleryItemRow = typeof profileGalleryItems.$inferInsert;
export type ProfileLockedGallerySettingsRow = typeof profileLockedGallerySettings.$inferSelect;
export type NewProfileLockedGallerySettingsRow =
  typeof profileLockedGallerySettings.$inferInsert;
export type AdminUserRow = typeof adminUsers.$inferSelect;
export type NewAdminUserRow = typeof adminUsers.$inferInsert;
export type AdminRoleRow = typeof adminRoles.$inferSelect;
export type NewAdminRoleRow = typeof adminRoles.$inferInsert;
export type AdminUserRoleRow = typeof adminUserRoles.$inferSelect;
export type NewAdminUserRoleRow = typeof adminUserRoles.$inferInsert;
export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogRow = typeof adminAuditLog.$inferInsert;
export type ClientErrorReportRow = typeof clientErrorReports.$inferSelect;
export type NewClientErrorReportRow = typeof clientErrorReports.$inferInsert;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type NewAnnouncementRow = typeof announcements.$inferInsert;
export type AnnouncementResponseRow = typeof announcementResponses.$inferSelect;
export type NewAnnouncementResponseRow = typeof announcementResponses.$inferInsert;
export type BlockedUserRow = typeof blockedUsers.$inferSelect;
export type NewBlockedUserRow = typeof blockedUsers.$inferInsert;
export type SafetyReportRow = typeof safetyReports.$inferSelect;
export type NewSafetyReportRow = typeof safetyReports.$inferInsert;
export type ReportReviewActionRow = typeof reportReviewActions.$inferSelect;
export type NewReportReviewActionRow = typeof reportReviewActions.$inferInsert;
export type MediaModerationReviewRow = typeof mediaModerationReviews.$inferSelect;
export type NewMediaModerationReviewRow = typeof mediaModerationReviews.$inferInsert;
export type NearbyStatusRow = typeof nearbyStatuses.$inferSelect;
export type NewNearbyStatusRow = typeof nearbyStatuses.$inferInsert;
export type TogetherQueueRow = typeof togetherQueue.$inferSelect;
export type NewTogetherQueueRow = typeof togetherQueue.$inferInsert;
export type TogetherSessionRow = typeof togetherSessions.$inferSelect;
export type NewTogetherSessionRow = typeof togetherSessions.$inferInsert;
export type TogetherSessionMemberRow = typeof togetherSessionMembers.$inferSelect;
export type NewTogetherSessionMemberRow = typeof togetherSessionMembers.$inferInsert;
export type TogetherEventRow = typeof togetherEvents.$inferSelect;
export type NewTogetherEventRow = typeof togetherEvents.$inferInsert;
export type TogetherRevealRow = typeof togetherReveals.$inferSelect;
export type NewTogetherRevealRow = typeof togetherReveals.$inferInsert;
export type ThreadRow = typeof threads.$inferSelect;
export type NewThreadRow = typeof threads.$inferInsert;
export type DirectThreadPairRow = typeof directThreadPairs.$inferSelect;
export type NewDirectThreadPairRow = typeof directThreadPairs.$inferInsert;
export type ThreadMemberRow = typeof threadMembers.$inferSelect;
export type NewThreadMemberRow = typeof threadMembers.$inferInsert;
export type ThreadContextRow = typeof threadContexts.$inferSelect;
export type NewThreadContextRow = typeof threadContexts.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type ThreadReadRow = typeof threadReads.$inferSelect;
export type NewThreadReadRow = typeof threadReads.$inferInsert;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;

export type ProfilePhoto = {
  mediaId: string;
  url: string;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
