export const MEDIA_MODERATION_ENGINE = "opennsfw_onnx_cpu";
export const MEDIA_MODERATION_MODEL_VERSION =
  "yahoo_open_nsfw_resnet50_1by2/opennsfw-onnx@0.1.0";
export const MEDIA_MODERATION_POLICY_VERSION = "amoria_public_photo_v4";

export const MEDIA_MODERATION_STATES = [
  "pending",
  "approved",
  "needs_review",
  "restricted",
  "removed",
] as const;

export type MediaModerationState = (typeof MEDIA_MODERATION_STATES)[number];
