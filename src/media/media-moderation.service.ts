import { validationError } from "../common/errors";
import type { MediaFileRow, MediaModerationJobRow } from "../db/schema";
import { findGalleryItemForMedia } from "../users/profile-gallery.repo";
import {
  enqueueMediaModerationJob,
  listPublicMediaModerationCandidates,
  updateMediaModerationState,
} from "./media.repo";

export type AutomaticModerationIntent = "avatar" | "public";

type ModerationMedia = Pick<MediaFileRow, "id" | "ownerUserId" | "type">;

type MediaModerationDeps = {
  enqueueMediaModerationJob: typeof enqueueMediaModerationJob;
  findGalleryItemForMedia: typeof findGalleryItemForMedia;
  listPublicMediaModerationCandidates: typeof listPublicMediaModerationCandidates;
  updateMediaModerationState: typeof updateMediaModerationState;
};

const defaultDeps: MediaModerationDeps = {
  enqueueMediaModerationJob,
  findGalleryItemForMedia,
  listPublicMediaModerationCandidates,
  updateMediaModerationState,
};

let deps: MediaModerationDeps = defaultDeps;

export function __setMediaModerationDepsForTests(
  overrides: Partial<MediaModerationDeps>,
): () => void {
  const previous = deps;
  deps = { ...deps, ...overrides };
  return () => {
    deps = previous;
  };
}

export async function queueInitialMediaModeration(
  media: ModerationMedia,
  intent: AutomaticModerationIntent,
): Promise<MediaModerationJobRow | undefined> {
  await assertAutomaticallyScannable(media, intent);
  await deps.updateMediaModerationState(media.id, "pending", "awaiting_automatic");
  return deps.enqueueMediaModerationJob(media.id);
}

export type BulkModerationEnqueueInput = {
  mediaIds: string[];
  dryRun?: boolean;
  maximumBatchSize?: number;
};

export type BulkModerationEnqueueResult = {
  dryRun: boolean;
  eligibleMediaIds: string[];
  enqueuedMediaIds: string[];
};

export async function enqueuePublicMediaModerationByIds(
  input: BulkModerationEnqueueInput,
): Promise<BulkModerationEnqueueResult> {
  const maximumBatchSize = input.maximumBatchSize ?? 100;
  if (!Number.isInteger(maximumBatchSize) || maximumBatchSize < 1 || maximumBatchSize > 100) {
    throw validationError("Moderation batch size is invalid", { maximumBatchSize: "invalid" });
  }

  const mediaIds = [...new Set(input.mediaIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (mediaIds.length === 0 || mediaIds.length > maximumBatchSize) {
    throw validationError("Moderation media ID set is invalid", {
      mediaIds: mediaIds.length === 0 ? "required" : "batch_too_large",
    });
  }

  const candidates = await deps.listPublicMediaModerationCandidates(mediaIds);
  const eligibleMediaIds = candidates
    .filter((media) => media.moderationState !== "removed")
    .map((media) => media.id);
  if (input.dryRun) {
    return { dryRun: true, eligibleMediaIds, enqueuedMediaIds: [] };
  }

  const enqueuedMediaIds: string[] = [];
  for (const mediaId of eligibleMediaIds) {
    await deps.updateMediaModerationState(mediaId, "pending", "awaiting_automatic_rescan");
    const job = await deps.enqueueMediaModerationJob(mediaId);
    if (job) {
      enqueuedMediaIds.push(mediaId);
    }
  }

  return { dryRun: false, eligibleMediaIds, enqueuedMediaIds };
}

async function assertAutomaticallyScannable(
  media: ModerationMedia,
  intent: AutomaticModerationIntent,
): Promise<void> {
  if (intent === "avatar") {
    if (media.type !== "avatar") {
      throw new Error("Only avatar media can be queued with avatar intent");
    }
    return;
  }

  if (media.type !== "profile_photo") {
    throw new Error("Only profile photos can be queued with public intent");
  }
  const gallery = await deps.findGalleryItemForMedia(media.ownerUserId, media.id);
  if (!gallery || gallery.item.visibility !== "public") {
    throw new Error("Locked or unclassified gallery media cannot be queued for automatic moderation");
  }
}
