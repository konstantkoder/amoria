import type { JsonValue, MediaFileRow, MediaModerationReviewRow } from "../db/schema";
import { createMediaModerationReview } from "./media.repo";

export type AutomatedMediaModerationSignal = "safe" | "unsafe" | "unknown";
export type PersonDetectionSignal = true | false | "unknown";
export type AutomatedMediaModerationStatus = "not_configured" | "completed" | "failed";

export type AutomatedMediaModerationResult = {
  automatedStatus: AutomatedMediaModerationStatus;
  automatedProvider: string;
  containsPerson: PersonDetectionSignal;
  nsfw: AutomatedMediaModerationSignal;
  violence: AutomatedMediaModerationSignal;
  confidence: Record<string, number>;
  labels: JsonValue;
  needsHumanReview: boolean;
};

export type AutomatedMediaModerationProvider = {
  name: string;
  analyzeImage(input: {
    mediaId: string;
    mediaType: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
  }): Promise<AutomatedMediaModerationResult>;
};

type ModerationMedia = Pick<
  MediaFileRow,
  "id" | "ownerUserId" | "type" | "mimeType" | "sizeBytes" | "width" | "height"
>;

type MediaModerationDeps = {
  createMediaModerationReview: typeof createMediaModerationReview;
  provider: AutomatedMediaModerationProvider;
};

const notConfiguredProvider: AutomatedMediaModerationProvider = {
  name: "NOT_CONFIGURED",
  async analyzeImage() {
    return {
      automatedStatus: "not_configured",
      automatedProvider: "NOT_CONFIGURED",
      containsPerson: "unknown",
      nsfw: "unknown",
      violence: "unknown",
      confidence: {},
      labels: [],
      needsHumanReview: true,
    };
  },
};

const defaultDeps: MediaModerationDeps = {
  createMediaModerationReview,
  provider: notConfiguredProvider,
};

let deps: MediaModerationDeps = defaultDeps;

export function __setMediaModerationDepsForTests(
  overrides: Partial<MediaModerationDeps>,
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

export async function queueInitialMediaModeration(
  media: ModerationMedia,
): Promise<MediaModerationReviewRow> {
  const result = await deps.provider.analyzeImage({
    mediaId: media.id,
    mediaType: media.type,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
  });

  return deps.createMediaModerationReview({
    mediaId: media.id,
    ownerUserId: media.ownerUserId,
    adminUserId: null,
    action: "mark_under_review",
    reason: moderationReason(result),
    metadata: {
      source: "automated_media_moderation",
      automatedStatus: result.automatedStatus,
      automatedProvider: result.automatedProvider,
      automatedCheckedAt: new Date().toISOString(),
      automatedLabels: result.labels,
      containsPerson: result.containsPerson,
      nsfw: result.nsfw,
      violence: result.violence,
      confidence: result.confidence,
      needsHumanReview: result.needsHumanReview,
    },
  });
}

function moderationReason(result: AutomatedMediaModerationResult): string {
  if (result.automatedStatus === "not_configured") {
    return "Automated moderation provider is not configured";
  }

  if (result.needsHumanReview) {
    return "Automated moderation requires human review";
  }

  return "Automated moderation completed; awaiting manual release policy decision";
}
