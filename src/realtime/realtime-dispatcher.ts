import type { RealtimeEvent } from "./realtime-event";
import { wsHub } from "./ws.hub";

export function dispatchRealtimeEvent(event: RealtimeEvent): void {
  if (!wsHub.acceptEvent(event.eventId)) return;
  switch (event.type) {
    case "thread.message":
      wsHub.broadcastThreadMessage(event.threadId, event.message, event.allowedUserIds);
      return;
    case "inbox.updated":
      wsHub.broadcastInboxUpdated(event.userIds);
      return;
    case "together.event":
      wsHub.broadcastTogetherEvent(event.sessionId, event.event);
      return;
    case "together.session.updated":
      wsHub.broadcastTogetherSessionUpdated(event.sessionId, event);
      return;
    case "together.reveal.updated":
      wsHub.broadcastTogetherRevealUpdated(event.sessionId, event.revealStates, event.actorUserId);
      return;
    case "together.turn_based.updated":
      wsHub.broadcastTurnBasedUpdated(event.userIds, event.moment);
      return;
    case "user.access_revoked":
      wsHub.disconnectUser(event.userId, event.reason);
  }
}
