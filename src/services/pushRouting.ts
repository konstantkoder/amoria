import type { RootStackParamList } from "@/navigation/appRoutes";

export type PushRoute = { [K in keyof RootStackParamList]: { name: K; params: RootStackParamList[K] } }[keyof RootStackParamList];
export type PushRoutingDeps = {
  findInboxThreadById: (threadId: string) => Promise<null | { id: string; peer: { id: string; displayName: string } }>;
  getSession: (sessionId: string) => Promise<{ session: { status: string; activity: string; mode: "live" | "turn_based" } }>;
};

async function loadDefaultDeps(): Promise<PushRoutingDeps> {
  const [chatApi, togetherApi] = await Promise.all([
    import("@/services/api/chatApi"),
    import("@/services/api/togetherApi"),
  ]);
  return { findInboxThreadById: chatApi.findInboxThreadById, getSession: togetherApi.getSession };
}

export async function resolvePushRoute(data: Record<string, unknown>, providedDeps?: PushRoutingDeps): Promise<PushRoute | null> {
  const deps = providedDeps ?? await loadDefaultDeps();
  const type = typeof data.type === "string" ? data.type : "";
  if (type === "direct_message") {
    const threadId = typeof data.threadId === "string" ? data.threadId : "";
    const thread = threadId ? await deps.findInboxThreadById(threadId) : null;
    if (!thread) return { name: "Tabs", params: { screen: "Inbox" } };
    return { name: "DMChat", params: { threadId: thread.id, peerId: thread.peer.id, peerName: thread.peer.displayName } };
  }
  if (type === "together_match" || type === "together_action") {
    const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
    if (!sessionId) return { name: "Tabs", params: { screen: "Together" } };
    try {
      const response = await deps.getSession(sessionId);
      if (response.session.status !== "active") return { name: "PlayResult", params: { sessionId, mode: response.session.mode } };
      return response.session.activity === "story_sparks"
        ? { name: "PlayStorySparks", params: { sessionId, mode: response.session.mode, ...(typeof data.momentId === "string" ? { momentId: data.momentId } : {}) } }
        : { name: "PlayCanvas", params: { sessionId, mode: response.session.mode } };
    } catch { return { name: "Tabs", params: { screen: "Together" } }; }
  }
  if (type === "announcement") {
    const announcementId = typeof data.announcementId === "string" ? data.announcementId : "";
    return announcementId ? { name: "AnnouncementDetail", params: { announcementId } } : { name: "Tabs", params: { screen: "Nearby" } };
  }
  if (type.startsWith("founder_") || type.startsWith("premium_")) return { name: "Premium", params: undefined };
  if (type === "community_activity") return { name: "CommunityAvailability", params: undefined };
  return null;
}
