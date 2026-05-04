export const SAFETY_REPORT_TARGET_TYPES = ["announcement", "thread", "user", "message"] as const;

export type SafetyReportTargetType = (typeof SAFETY_REPORT_TARGET_TYPES)[number];

export type BlockUserBody = {
  blockedUserId: string;
};

export type BlockedUserDto = {
  blockedUserId: string;
  createdAt: string;
};

export type BlockedUsersResponse = {
  items: BlockedUserDto[];
};

export type CreateSafetyReportBody = {
  targetType: SafetyReportTargetType;
  targetId: string;
  targetOwnerUserId?: string | null;
  reason: string;
  comment?: string | null;
};

export type OkResponse = {
  ok: true;
};
