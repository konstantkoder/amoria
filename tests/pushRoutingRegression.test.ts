import assert from "node:assert/strict";
import test from "node:test";

import { resolvePushRoute, type PushRoutingDeps } from "../src/services/pushRouting";

function routingDeps(options: { thread?: unknown; session?: unknown; failSession?: boolean } = {}): PushRoutingDeps {
  return {
    findInboxThreadById: async () => (options.thread ?? null) as Awaited<ReturnType<PushRoutingDeps["findInboxThreadById"]>>,
    getSession: async () => {
      if (options.failSession) throw new Error("stale");
      return options.session as Awaited<ReturnType<PushRoutingDeps["getSession"]>>;
    },
  };
}

test("message push opens the exact DM or safely falls back to Inbox", async () => {
  const thread = { id: "thread-1", peer: { id: "peer-1", displayName: "Peer" } };
  assert.deepEqual(await resolvePushRoute({ type: "direct_message", threadId: "thread-1" }, routingDeps({ thread })), {
    name: "DMChat", params: { threadId: "thread-1", peerId: "peer-1", peerName: "Peer" },
  });
  assert.deepEqual(await resolvePushRoute({ type: "direct_message", threadId: "missing" }, routingDeps()), {
    name: "Tabs", params: { screen: "Inbox" },
  });
});

test("Together push routes active draw, story, finished, and stale sessions safely", async () => {
  const activeDraw = { session: { status: "active", activity: "draw", mode: "turn_based" } };
  const activeStory = { session: { status: "active", activity: "story_sparks", mode: "live" } };
  const finished = { session: { status: "finished", activity: "draw", mode: "turn_based" } };
  assert.deepEqual(await resolvePushRoute({ type: "together_action", sessionId: "s1" }, routingDeps({ session: activeDraw })), {
    name: "PlayCanvas", params: { sessionId: "s1", mode: "turn_based" },
  });
  assert.deepEqual(await resolvePushRoute({ type: "together_action", sessionId: "s2", momentId: "m2" }, routingDeps({ session: activeStory })), {
    name: "PlayStorySparks", params: { sessionId: "s2", mode: "live", momentId: "m2" },
  });
  assert.deepEqual(await resolvePushRoute({ type: "together_match", sessionId: "s3" }, routingDeps({ session: finished })), {
    name: "PlayResult", params: { sessionId: "s3", mode: "turn_based" },
  });
  assert.deepEqual(await resolvePushRoute({ type: "together_match", sessionId: "stale" }, routingDeps({ failSession: true })), {
    name: "Tabs", params: { screen: "Together" },
  });
});

test("Founder, Premium, and community pushes retain their guarded destinations", async () => {
  const deps = routingDeps();
  assert.deepEqual(await resolvePushRoute({ type: "founder_activated" }, deps), { name: "Premium", params: undefined });
  assert.deepEqual(await resolvePushRoute({ type: "premium_billing_issue" }, deps), { name: "Premium", params: undefined });
  assert.deepEqual(await resolvePushRoute({ type: "community_activity" }, deps), { name: "CommunityAvailability", params: undefined });
  assert.equal(await resolvePushRoute({ type: "unknown" }, deps), null);
});
