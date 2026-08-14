import type { WebSocket } from "@fastify/websocket";
import type { MessageDto } from "../chat/chat.types";
import type {
  TogetherEventDto,
  TogetherRevealBroadcastState,
  TogetherRevealStateDto,
  TogetherSessionResponse,
  TogetherSessionUpdateReason,
} from "../together/together.types";
import type { TurnBasedMomentDto } from "../together/together-turn-based.types";
import { env } from "../config/env";
import { incrementMetric, setMetric } from "../observability/metrics";

export type TogetherSessionUpdatedPayload = {
  sessionId: string;
  session: TogetherSessionResponse;
  reason: TogetherSessionUpdateReason;
  actorUserId: string;
};

export type TogetherRevealUpdatedPayload = {
  sessionId: string;
  revealState: TogetherRevealStateDto;
  actorUserId: string;
};

type SocketState = {
  userId: string;
  authVersion: number;
  inboxSubscribed: boolean;
  threadIds: Set<string>;
  togetherSessionIds: Set<string>;
};

class WsHub {
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  private readonly threadSockets = new Map<string, Set<WebSocket>>();
  private readonly togetherSessionSockets = new Map<string, Set<WebSocket>>();
  private readonly socketState = new WeakMap<WebSocket, SocketState>();
  private readonly recentEvents = new Map<string, number>();
  private connectionCount = 0;
  private subscriptionCount = 0;

  addSocket(userId: string, socket: WebSocket, authVersion = 0): boolean {
    let sockets = this.userSockets.get(userId);
    if (
      (sockets?.size ?? 0) >= env.WS_MAX_CONNECTIONS_PER_USER ||
      this.connectionCount >= env.WS_MAX_CONNECTIONS_PER_INSTANCE
    ) {
      incrementMetric("amoria_ws_connections_rejected_total", {
        reason: this.connectionCount >= env.WS_MAX_CONNECTIONS_PER_INSTANCE ? "instance_limit" : "user_limit",
      });
      return false;
    }

    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }

    sockets.add(socket);
    this.connectionCount += 1;
    this.socketState.set(socket, {
      userId,
      authVersion,
      inboxSubscribed: false,
      threadIds: new Set(),
      togetherSessionIds: new Set(),
    });
    incrementMetric("amoria_ws_connections_accepted_total");
    setMetric("amoria_ws_connections", this.connectionCount);
    return true;
  }

  removeSocket(socket: WebSocket): void {
    const state = this.socketState.get(socket);
    if (!state) {
      return;
    }
    const removedSubscriptions = Number(state.inboxSubscribed) + state.threadIds.size + state.togetherSessionIds.size;

    const userSockets = this.userSockets.get(state.userId);
    userSockets?.delete(socket);
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    if (userSockets?.size === 0) {
      this.userSockets.delete(state.userId);
    }

    for (const threadId of state.threadIds) {
      const sockets = this.threadSockets.get(threadId);
      sockets?.delete(socket);
      if (sockets?.size === 0) {
        this.threadSockets.delete(threadId);
      }
    }

    for (const sessionId of state.togetherSessionIds) {
      const sockets = this.togetherSessionSockets.get(sessionId);
      sockets?.delete(socket);
      if (sockets?.size === 0) {
        this.togetherSessionSockets.delete(sessionId);
      }
    }

    this.socketState.delete(socket);
    incrementMetric("amoria_ws_disconnects_total");
    setMetric("amoria_ws_connections", this.connectionCount);
    this.subscriptionCount = Math.max(0, this.subscriptionCount - removedSubscriptions);
    setMetric("amoria_ws_subscriptions", this.subscriptionCount);
  }

  subscribeInbox(socket: WebSocket): boolean {
    const state = this.socketState.get(socket);
    if (!state) return false;
    if (state.inboxSubscribed) return true;
    if (!this.hasSubscriptionCapacity(state)) return false;
    state.inboxSubscribed = true;
    this.subscriptionAdded();
    return true;
  }

  unsubscribeInbox(socket: WebSocket): void {
    const state = this.socketState.get(socket);
    if (state) {
      if (state.inboxSubscribed) this.subscriptionRemoved();
      state.inboxSubscribed = false;
    }
  }

  subscribeThread(socket: WebSocket, threadId: string): boolean {
    const state = this.socketState.get(socket);
    if (!state) {
      return false;
    }
    if (state.threadIds.has(threadId)) return true;
    if (!this.hasSubscriptionCapacity(state)) return false;

    let sockets = this.threadSockets.get(threadId);
    if (!sockets) {
      sockets = new Set();
      this.threadSockets.set(threadId, sockets);
    }

    sockets.add(socket);
    state.threadIds.add(threadId);
    this.subscriptionAdded();
    return true;
  }

  unsubscribeThread(socket: WebSocket, threadId: string): void {
    const state = this.socketState.get(socket);
    if (state?.threadIds.delete(threadId)) this.subscriptionRemoved();

    const sockets = this.threadSockets.get(threadId);
    sockets?.delete(socket);
    if (sockets?.size === 0) {
      this.threadSockets.delete(threadId);
    }
  }

  subscribeTogether(socket: WebSocket, sessionId: string): boolean {
    const state = this.socketState.get(socket);
    if (!state) {
      return false;
    }
    if (state.togetherSessionIds.has(sessionId)) return true;
    if (!this.hasSubscriptionCapacity(state)) return false;

    let sockets = this.togetherSessionSockets.get(sessionId);
    if (!sockets) {
      sockets = new Set();
      this.togetherSessionSockets.set(sessionId, sockets);
    }

    sockets.add(socket);
    state.togetherSessionIds.add(sessionId);
    this.subscriptionAdded();
    return true;
  }

  unsubscribeTogether(socket: WebSocket, sessionId: string): void {
    const state = this.socketState.get(socket);
    if (state?.togetherSessionIds.delete(sessionId)) this.subscriptionRemoved();

    const sockets = this.togetherSessionSockets.get(sessionId);
    sockets?.delete(socket);
    if (sockets?.size === 0) {
      this.togetherSessionSockets.delete(sessionId);
    }
  }

  broadcastThreadMessage(threadId: string, message: MessageDto, allowedUserIds?: string[]): void {
    const sockets = this.threadSockets.get(threadId);
    if (!sockets) return;
    const allowed = allowedUserIds ? new Set(allowedUserIds) : null;
    for (const socket of sockets) {
      const state = this.socketState.get(socket);
      if (allowed && (!state || !allowed.has(state.userId))) continue;
      this.sendJson(socket, { type: "thread.message", threadId, message });
    }
  }

  disconnectUser(userId: string, reason = "Access revoked"): void {
    const sockets = [...(this.userSockets.get(userId) ?? [])];
    for (const socket of sockets) {
      this.removeSocket(socket);
      socket.close(1008, reason);
    }
  }

  connectedUserIds(): string[] {
    return [...this.userSockets.keys()];
  }

  revalidateUserAccess(userId: string, activeAuthVersion: number | undefined): number {
    const sockets = [...(this.userSockets.get(userId) ?? [])];
    let disconnected = 0;
    for (const socket of sockets) {
      const state = this.socketState.get(socket);
      if (activeAuthVersion !== undefined && state?.authVersion === activeAuthVersion) continue;
      this.removeSocket(socket);
      socket.close(1008, "Access revoked");
      disconnected += 1;
    }
    return disconnected;
  }

  acceptEvent(eventId: string): boolean {
    const now = Date.now();
    if (this.recentEvents.has(eventId)) return false;
    this.recentEvents.set(eventId, now + 60_000);
    if (this.recentEvents.size > 10_000) {
      for (const [id, expiresAt] of this.recentEvents) {
        if (expiresAt <= now || this.recentEvents.size > 10_000) this.recentEvents.delete(id);
      }
    }
    return true;
  }

  broadcastTogetherEvent(sessionId: string, event: TogetherEventDto): void {
    this.broadcastToSockets(this.togetherSessionSockets.get(sessionId), {
      type: "together.event",
      sessionId,
      event,
    });
  }

  broadcastTogetherSessionUpdated(
    sessionId: string,
    payload: TogetherSessionUpdatedPayload,
  ): void {
    this.broadcastToSockets(this.togetherSessionSockets.get(sessionId), {
      type: "together.session.updated",
      ...payload,
    });
  }

  broadcastTogetherRevealUpdated(
    sessionId: string,
    revealStates: TogetherRevealBroadcastState[],
    actorUserId: string,
  ): void {
    const sockets = this.togetherSessionSockets.get(sessionId);
    if (!sockets) {
      return;
    }

    const statesByUserId = new Map(
      revealStates.map((state) => [state.userId, state.revealState]),
    );
    for (const socket of sockets) {
      const state = this.socketState.get(socket);
      const revealState = state ? statesByUserId.get(state.userId) : undefined;
      if (!revealState) {
        continue;
      }

      this.sendJson(socket, {
        type: "together.reveal.updated",
        sessionId,
        revealState,
        actorUserId,
      } satisfies TogetherRevealUpdatedPayload & { type: "together.reveal.updated" });
    }
  }

  broadcastInboxUpdated(userIds: string[]): void {
    for (const userId of new Set(userIds)) {
      const sockets = this.userSockets.get(userId);
      if (!sockets) {
        continue;
      }

      for (const socket of sockets) {
        const state = this.socketState.get(socket);
        if (state?.inboxSubscribed) {
          this.sendJson(socket, { type: "inbox.updated" });
        }
      }
    }
  }

  broadcastTurnBasedUpdated(userIds: string[], moment: TurnBasedMomentDto): void {
    for (const userId of new Set(userIds)) {
      this.broadcastToSockets(this.userSockets.get(userId), {
        type: "together.turn_based.updated",
        moment,
      });
    }
  }

  sendError(socket: WebSocket, code: string, message: string): void {
    this.sendJson(socket, { type: "error", code, message });
  }

  sendSubscriptionAck(
    socket: WebSocket,
    type: "subscribed" | "unsubscribed",
    channel: "inbox" | "thread" | "together",
    id?: { threadId: string } | { sessionId: string },
  ): void {
    this.sendJson(socket, { type, channel, ...id });
  }

  private broadcastToSockets(sockets: Set<WebSocket> | undefined, payload: unknown): void {
    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      this.sendJson(socket, payload);
    }
  }

  private sendJson(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== 1) {
      return;
    }

    if (socket.bufferedAmount > env.WS_MAX_BUFFERED_BYTES) {
      incrementMetric("amoria_ws_slow_client_disconnects_total");
      this.removeSocket(socket);
      socket.close(1013, "Slow client; reconnect and refetch");
      return;
    }
    socket.send(JSON.stringify(payload), (error?: Error) => {
      if (error) incrementMetric("amoria_ws_send_errors_total");
    });
  }

  private hasSubscriptionCapacity(state: SocketState): boolean {
    const count = Number(state.inboxSubscribed) + state.threadIds.size + state.togetherSessionIds.size;
    if (count < env.WS_MAX_SUBSCRIPTIONS_PER_CONNECTION) return true;
    incrementMetric("amoria_ws_subscriptions_rejected_total", { reason: "connection_limit" });
    return false;
  }

  private subscriptionAdded(): void {
    incrementMetric("amoria_ws_subscription_changes_total", { action: "add" });
    this.subscriptionCount += 1;
    setMetric("amoria_ws_subscriptions", this.subscriptionCount);
  }

  private subscriptionRemoved(): void {
    incrementMetric("amoria_ws_subscription_changes_total", { action: "remove" });
    this.subscriptionCount = Math.max(0, this.subscriptionCount - 1);
    setMetric("amoria_ws_subscriptions", this.subscriptionCount);
  }
}

export const wsHub = new WsHub();
