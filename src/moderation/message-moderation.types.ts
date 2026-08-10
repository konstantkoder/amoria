import type { JsonValue, MessageRow } from "../db/schema";

export const MESSAGE_MODERATION_STATES = [
  "visible",
  "held",
  "needs_review",
  "restricted",
  "removed",
] as const;

export type MessageModerationState = (typeof MESSAGE_MODERATION_STATES)[number];
export type MessageSource = "direct" | "nearby";
export type MessageAutomationStatus =
  | "completed"
  | "failed"
  | "not_configured"
  | "not_required";

export type ModeratedMessageRow = MessageRow & {
  moderationState: MessageModerationState;
  automationStatus: MessageAutomationStatus;
  moderationSource: MessageSource;
};
export type ModerationEvidence = {
  source: "automated_spam" | "automated_local_model";
  action: "allow" | "flag" | "hold" | "restrict";
  reason: string | null;
  metadata: JsonValue;
};

export type MessageSafetyDecision = {
  state: MessageModerationState;
  automationStatus: MessageAutomationStatus;
  evidence: ModerationEvidence[];
};
