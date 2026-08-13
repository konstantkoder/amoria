import { env } from "../config/env";
import { claimSharedPresenceHeartbeat } from "../realtime/realtime-bus";
import { touchUserLastSeenAt } from "./users.repo";

const MAX_LOCAL_PRESENCE_GATES = 10_000;
const localPresenceGates = new Map<string, number>();

type PresenceDeps = {
  claimShared: typeof claimSharedPresenceHeartbeat;
  touch: typeof touchUserLastSeenAt;
  now: () => Date;
  heartbeatIntervalMs: number;
};

const defaultDeps: PresenceDeps = {
  claimShared: claimSharedPresenceHeartbeat,
  touch: touchUserLastSeenAt,
  now: () => new Date(),
  heartbeatIntervalMs: env.PRESENCE_HEARTBEAT_INTERVAL_MS,
};

let deps = defaultDeps;

export async function refreshUserPresence(
  userId: string,
  lastSeenAt: Date | null,
): Promise<boolean> {
  const seenAt = deps.now();
  const staleBeforeMs = seenAt.getTime() - deps.heartbeatIntervalMs;
  if (lastSeenAt && lastSeenAt.getTime() >= staleBeforeMs) return false;
  if (!claimLocalPresenceGate(userId, seenAt.getTime(), deps.heartbeatIntervalMs)) return false;

  const sharedClaim = await deps.claimShared(userId, deps.heartbeatIntervalMs);
  if (sharedClaim === false) return false;

  await deps.touch(userId, seenAt, deps.heartbeatIntervalMs);
  return true;
}

export function __setUserPresenceDepsForTests(overrides: Partial<PresenceDeps>): () => void {
  const previous = deps;
  deps = { ...deps, ...overrides };
  localPresenceGates.clear();
  return () => {
    deps = previous;
    localPresenceGates.clear();
  };
}

function claimLocalPresenceGate(userId: string, nowMs: number, ttlMs: number): boolean {
  const currentExpiry = localPresenceGates.get(userId);
  if (currentExpiry && currentExpiry > nowMs) return false;

  if (localPresenceGates.size >= MAX_LOCAL_PRESENCE_GATES) {
    for (const [key, expiresAt] of localPresenceGates) {
      if (expiresAt <= nowMs) localPresenceGates.delete(key);
    }
    // Presence is non-authoritative. If a bus outage and a full local gate occur
    // together, keep requests available and rely on the conditional DB update.
    if (localPresenceGates.size >= MAX_LOCAL_PRESENCE_GATES) return true;
  }

  localPresenceGates.set(userId, nowMs + ttlMs);
  return true;
}
