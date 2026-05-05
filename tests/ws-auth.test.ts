import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

type TestWebSocket = {
  once(event: "open", listener: () => void): TestWebSocket;
  once(event: "close", listener: (code: number, reason: Buffer) => void): TestWebSocket;
  once(event: "error", listener: (error: Error) => void): TestWebSocket;
  close(): void;
  terminate(): void;
};

const WebSocketClient = require("ws") as {
  new (url: string, options?: { headers?: Record<string, string> }): TestWebSocket;
};

test.after(async () => {
  await closeDb();
});

test("WS invalid token closes the connection with policy violation", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const wsUrl = await listenWsUrl(app);
  const socket = new WebSocketClient(`${wsUrl}/ws?token=invalid-token`);
  t.after(() => {
    socket.terminate();
  });

  const close = await waitForClose(socket);

  assert.equal(close.code, 1008);
  assert.equal(close.reason, "Invalid access token");
});

test("WS accepts Authorization bearer token when query token is absent", async (t) => {
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const token = signAccessToken("00000000-0000-4000-8000-000000000001");
  const wsUrl = await listenWsUrl(app);
  const socket = new WebSocketClient(`${wsUrl}/ws`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  t.after(() => {
    socket.terminate();
  });

  await waitForOpen(socket);
  socket.close();
  await waitForClose(socket);
});

async function listenWsUrl(app: ReturnType<typeof buildApp>): Promise<string> {
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return address.replace(/^http:/, "ws:");
}

function waitForOpen(socket: TestWebSocket): Promise<void> {
  return waitForSocketEvent(socket, (resolve) => {
    socket.once("open", () => resolve());
  });
}

function waitForClose(socket: TestWebSocket): Promise<{ code: number; reason: string }> {
  return waitForSocketEvent(socket, (resolve) => {
    socket.once("close", (code, reason) =>
      resolve({
        code,
        reason: reason.toString("utf8"),
      }),
    );
  });
}

function waitForSocketEvent<T>(
  socket: TestWebSocket,
  attach: (resolve: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket event"));
    }, 2_000);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    attach((value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
}
