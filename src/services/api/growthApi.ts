import { request } from "@/services/api/apiClient";

export type Invite = {
  code: string;
  link: string;
  verifiedHttpsLink: string | null;
  shares: number;
  activatedInvites: number;
};

export type PushPreferences = {
  messages: boolean;
  together: boolean;
  communityActivity: boolean;
  premiumAccount: boolean;
  transactionalAlwaysOn: true;
};

export type Availability = {
  activeToday: boolean;
  activeTodayUntil: string | null;
  notifyWhenActivity: boolean;
};

export const getInvite = () => request<Invite>("GET", "/me/invite");
export const markInviteShared = () => request<Invite>("POST", "/me/invite/shared");
export const claimAttribution = (input: { code: string; sourceCode: string; installId: string }) =>
  request<{ claimed: boolean }>("POST", "/me/acquisition/claim", input);
export const recordEvent = (eventName: string, sourceCode?: string, metadata?: Record<string, string | number | boolean>) =>
  request<{ recorded: true }>("POST", "/analytics/events", { eventName, sourceCode, metadata });
export const getPushPreferences = () => request<PushPreferences>("GET", "/me/push-preferences");
export const updatePushPreferences = (input: Omit<PushPreferences, "transactionalAlwaysOn">) =>
  request<PushPreferences>("PUT", "/me/push-preferences", input);
export const getAvailability = () => request<Availability>("GET", "/me/availability");
export const updateAvailability = (input: { activeToday?: boolean; notifyWhenActivity?: boolean }) =>
  request<Availability>("PUT", "/me/availability", input);
export const setTogetherShareConsent = (sessionId: string, consent: boolean) =>
  request<{ consented: boolean; shareMode: "joint_result" | "neutral_amoria_card" }>("PUT", `/together/sessions/${encodeURIComponent(sessionId)}/share-consent`, { consent });
