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
  inboxSubscribed: boolean;
  threadIds: Set<string>;
  togetherSessionIds: Set<string>;
};

class WsHub {
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  private readonly threadSockets = new Map<string, Set<WebSocket>>();
  private readonly togetherSessionSockets = new Map<string, Set<WebSocket>>();
  private readonly socketState = new WeakMap<WebSocket, SocketState>();

  addSocket(userId: string, socket: WebSocket): void {
    let sockets = this.userSockets.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.userSockets.set(userId, sockets);
    }

    sockets.add(socket);
    this.socketState.set(socket, {
      userId,
      inboxSubscribed: false,
      threadIds: new Set(),
      togetherSessionIds: new Set(),
    });
  }

  removeSocket(socket: WebSocket): void {
    const state = this.socketState.get(socket);
    if (!state) {
      return;
    }

    const userSockets = this.userSockets.get(state.userId);
    userSockets?.delete(socket);
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
  }

  subscribeInbox(socket: WebSocket): void {
    const state = this.socketState.get(socket);
    if (state) {
      state.inboxSubscribed = true;
    }
  }

  unsubscribeInbox(socket: WebSocket): void {
    const state = this.socketState.get(socket);
    if (state) {
      state.inboxSubscribed = false;
    }
  }

  subscribeThread(socket: WebSocket, threadId: string): void {
    const state = this.socketState.get(socket);
    if (!state) {
      return;
    }

    let sockets = this.threadSockets.get(threadId);
    if (!sockets) {
      sockets = new Set();
      this.threadSockets.set(threadId, sockets);
    }

    sockets.add(socket);
    state.threadIds.add(threadId);
  }

  unsubscribeThread(socket: WebSocket, threadId: string): void {
    const state = this.socketState.get(socket);
    state?.threadIds.delete(threadId);

    const sockets = this.threadSockets.get(threadId);
    sockets?.delete(socket);
    if (sockets?.size === 0) {
      this.threadSockets.delete(threadId);
    }
  }

  subscribeTogether(socket: WebSocket, sessionId: string): void {
    const state = this.socketState.get(socket);
    if (!state) {
      return;
    }

    let sockets = this.togetherSessionSockets.get(sessionId);
    if (!sockets) {
      sockets = new Set();
      this.togetherSessionSockets.set(sessionId, sockets);
    }

    sockets.add(socket);
    state.togetherSessionIds.add(sessionId);
  }

  unsubscribeTogether(socket: WebSocket, sessionId: string): void {
    const state = this.socketState.get(socket);
    state?.togetherSessionIds.delete(sessionId);

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

    socket.send(JSON.stringify(payload));
  }
}

export const wsHub = new WsHub();
