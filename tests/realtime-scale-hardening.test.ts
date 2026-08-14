import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isWebSocketUpgradeRequest } from "../src/common/http-admission";
import {
  __incrementFixedWindowForTests,
  __refreshWsLeaseEntriesForTests,
} from "../src/realtime/realtime-bus";

test("shared fixed-window increment is one atomic eval and always gives a new key a TTL", async () => {
  let count = 0;
  let ttl = -1;
  let evalCalls = 0;
  const client = {
    eval: async (script: string, options: { arguments: string[] }) => {
      evalCalls += 1;
      assert.match(script, /INCR/);
      assert.match(script, /PEXPIRE/);
      count += 1;
      if (count === 1 || ttl < 0) ttl = Number(options.arguments[0]);
      return count;
    },
  };

  const first = await __incrementFixedWindowForTests(client as never, "hashed-key", 60_000);
  assert.equal(first, 1);
  assert.equal(ttl, 60_000);

  const concurrent = await Promise.all(
    Array.from({ length: 50 }, () => __incrementFixedWindowForTests(client as never, "hashed-key", 60_000)),
  );
  assert.deepEqual(concurrent, Array.from({ length: 50 }, (_, index) => index + 2));
  assert.equal(evalCalls, 51);

  // An old key left without a TTL by the former split-command implementation
  // is repaired by the same atomic script.
  ttl = -1;
  await __incrementFixedWindowForTests(client as never, "hashed-key", 60_000);
  assert.equal(ttl, 60_000);
});

test("ready reconciliation recreates live leases but an absent closed lease is not renewed", async () => {
  const leases = new Map<string, Set<string>>();
  const expiries = new Map<string, number>();
  const client = {
    multi: () => {
      const commands: Array<() => void> = [];
      const transaction = {
        zAdd: (key: string, value: { value: string }, options?: { condition?: string }) => {
          commands.push(() => {
            const values = leases.get(key) ?? new Set<string>();
            if (options?.condition === "XX" && !values.has(value.value)) return;
            values.add(value.value);
            leases.set(key, values);
          });
          return transaction;
        },
        pExpire: (key: string, ttl: number) => {
          commands.push(() => { if (leases.has(key)) expiries.set(key, ttl); });
          return transaction;
        },
        exec: async () => { commands.forEach((command) => command()); return []; },
      };
      return transaction;
    },
  };

  await __refreshWsLeaseEntriesForTests(
    client as never,
    [["live-lease", "amoria:ws-user:hashed"]],
    Date.now() + 90_000,
    true,
  );
  assert.equal(leases.get("amoria:ws-user:hashed")?.has("live-lease"), true);
  assert.equal(expiries.get("amoria:ws-user:hashed"), 100_000);

  leases.clear();
  expiries.clear();
  await __refreshWsLeaseEntriesForTests(client as never, [], Date.now() + 90_000, true);
  assert.equal(leases.size, 0);

  await __refreshWsLeaseEntriesForTests(
    client as never,
    [["missing-lease", "amoria:ws-user:hashed"]],
    Date.now() + 90_000,
    false,
  );
  assert.equal(leases.size, 0);
});

test("WebSocket upgrades bypass ordinary HTTP in-flight admission", () => {
  assert.equal(isWebSocketUpgradeRequest({
    method: "GET",
    url: "/ws?generator=scale",
    headers: { upgrade: "websocket" },
  }), true);
  assert.equal(isWebSocketUpgradeRequest({ method: "GET", url: "/ws", headers: {} }), false);
  assert.equal(isWebSocketUpgradeRequest({
    method: "GET",
    url: "/health/ready",
    headers: { upgrade: "websocket" },
  }), false);
});

test("WebSocket message buffering is installed before the first asynchronous gate", () => {
  const source = readFileSync("src/realtime/ws.routes.ts", "utf8");
  const listener = source.indexOf('socket.on("message"');
  const sharedGate = source.indexOf("await consumeSharedWsConnectionAttempt");
  assert.ok(listener >= 0 && sharedGate >= 0 && listener < sharedGate);
});
