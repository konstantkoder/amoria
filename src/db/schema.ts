import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
  announcements: many(announcements),
  announcementResponses: many(announcementResponses),
  threadMembers: many(threadMembers),
  messages: many(messages),
  threadReads: many(threadReads),
  refreshTokens: many(refreshTokens),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one, many }) => ({
  owner: one(users, {
    fields: [mediaFiles.ownerUserId],
    references: [users.id],
  }),
  photoAnnouncements: many(announcements),
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

export const threadsRelations = relations(threads, ({ many }) => ({
  members: many(threadMembers),
  messages: many(messages),
  reads: many(threadReads),
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
export type AnnouncementRow = typeof announcements.$inferSelect;
export type NewAnnouncementRow = typeof announcements.$inferInsert;
export type AnnouncementResponseRow = typeof announcementResponses.$inferSelect;
export type NewAnnouncementResponseRow = typeof announcementResponses.$inferInsert;
export type ThreadRow = typeof threads.$inferSelect;
export type NewThreadRow = typeof threads.$inferInsert;
export type ThreadMemberRow = typeof threadMembers.$inferSelect;
export type NewThreadMemberRow = typeof threadMembers.$inferInsert;
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
