import type { WebSocket } from "@fastify/websocket";
import type { MessageDto } from "../chat/chat.types";

type SocketState = {
  userId: string;
  inboxSubscribed: boolean;
  threadIds: Set<string>;
};

class WsHub {
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  private readonly threadSockets = new Map<string, Set<WebSocket>>();
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

  broadcastThreadMessage(threadId: string, message: MessageDto): void {
    this.broadcastToSockets(this.threadSockets.get(threadId), {
      type: "thread.message",
      threadId,
      message,
    });
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
