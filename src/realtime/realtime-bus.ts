import { createClient, type RedisClientType } from "redis";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env";
import { incrementMetric, observeMetric } from "../observability/metrics";
import { dispatchRealtimeEvent } from "./realtime-dispatcher";
import { createRealtimeEvent, parseRealtimeEvent, type RealtimeEventPayload } from "./realtime-event";

let publisher: RedisClientType | undefined;
let subscriber: RedisClientType | undefined;
let starting: Promise<void> | undefined;
const wsUserConnectionLeases = new Map<string, string>();
let wsLeaseHeartbeatTimer: NodeJS.Timeout | undefined;
let wsLeaseHeartbeatRunning = false;
const WS_LEASE_TTL_MS = 90_000;
const WS_LEASE_HEARTBEAT_MS = 30_000;

function newClient(): RedisClientType {
  const client = createClient({
    url: env.REALTIME_BUS_URL,
    socket: { connectTimeout: env.REALTIME_BUS_CONNECT_TIMEOUT_MS },
  });
  client.on("error", () => incrementMetric("amoria_realtime_bus_errors_total"));
  client.on("reconnecting", () => incrementMetric("amoria_realtime_bus_reconnects_total"));
  return client as RedisClientType;
}

export async function startRealtimeBus(): Promise<void> {
  if (!env.REALTIME_BUS_URL || (publisher?.isReady && subscriber?.isReady)) return;
  if (starting) return starting;
  starting = (async () => {
    publisher = newClient();
    subscriber = newClient();
    await Promise.all([publisher.connect(), subscriber.connect()]);
    await subscriber.subscribe(env.REALTIME_BUS_CHANNEL, (raw) => {
      const event = parseRealtimeEvent(raw, env.REALTIME_EVENT_MAX_BYTES);
      if (!event) {
        incrementMetric("amoria_realtime_bus_invalid_events_total");
        return;
      }
      incrementMetric("amoria_realtime_bus_received_total", { type: event.type });
      const occurredAt = Date.parse(event.occurredAt);
      if (Number.isFinite(occurredAt)) {
        observeMetric("amoria_realtime_bus_delivery_seconds", Math.max(0, Date.now() - occurredAt) / 1000, {
          type: event.type,
        });
      }
      dispatchRealtimeEvent(event);
    });
    if (!wsLeaseHeartbeatTimer) {
      wsLeaseHeartbeatTimer = setInterval(() => { void heartbeatWsUserConnectionLeases(); }, WS_LEASE_HEARTBEAT_MS);
      wsLeaseHeartbeatTimer.unref();
    }
  })().finally(() => { starting = undefined; });
  return starting;
}

export async function publishRealtimeEvent(payload: RealtimeEventPayload): Promise<void> {
  const event = createRealtimeEvent(payload);
  await publishPreparedEvent(event);
}

async function publishPreparedEvent(event: ReturnType<typeof createRealtimeEvent>): Promise<void> {
  const raw = JSON.stringify(event);
  if (Buffer.byteLength(raw, "utf8") > env.REALTIME_EVENT_MAX_BYTES) {
    incrementMetric("amoria_realtime_bus_publish_errors_total", { reason: "oversize" });
    throw new Error("realtime_event_too_large");
  }
  if (!parseRealtimeEvent(raw, env.REALTIME_EVENT_MAX_BYTES)) {
    incrementMetric("amoria_realtime_bus_publish_errors_total", { reason: "schema" });
    throw new Error("realtime_event_invalid");
  }
  if (!env.REALTIME_BUS_URL) {
    dispatchRealtimeEvent(event);
    incrementMetric("amoria_realtime_bus_published_total", { type: event.type, transport: "local" });
    return;
  }
  if (!publisher?.isReady) throw new Error("realtime_bus_not_ready");
  try {
    await publisher.publish(env.REALTIME_BUS_CHANNEL, raw);
    incrementMetric("amoria_realtime_bus_published_total", { type: event.type, transport: "valkey" });
  } catch (error) {
    incrementMetric("amoria_realtime_bus_publish_errors_total", { reason: "transport" });
    throw error;
  }
}

export async function publishRealtimeEventSafely(
  payload: RealtimeEventPayload,
  log?: { error: (value: unknown, message?: string) => void },
): Promise<boolean> {
  const event = createRealtimeEvent(payload);
  try {
    await publishPreparedEvent(event);
    return true;
  } catch (error) {
    // Publish acknowledgement can be ambiguous. Deliver locally with the same
    // event id; the hub's bounded dedupe suppresses a late bus copy.
    dispatchRealtimeEvent(event);
    log?.error({ err: error, eventType: payload.type }, "Realtime publish failed; clients must refetch");
    return false;
  }
}

export async function stopRealtimeBus(): Promise<void> {
  if (wsLeaseHeartbeatTimer) clearInterval(wsLeaseHeartbeatTimer);
  wsLeaseHeartbeatTimer = undefined;
  if (publisher?.isReady && wsUserConnectionLeases.size > 0) {
    const entries = [...wsUserConnectionLeases.entries()];
    for (let offset = 0; offset < entries.length; offset += 500) {
      const transaction = publisher.multi();
      for (const [leaseId, key] of entries.slice(offset, offset + 500)) transaction.zRem(key, leaseId);
      await transaction.exec().catch(() => incrementMetric("amoria_realtime_bus_errors_total"));
    }
  }
  wsUserConnectionLeases.clear();
  const clients = [subscriber, publisher].filter((client): client is RedisClientType => Boolean(client));
  subscriber = undefined;
  publisher = undefined;
  await Promise.allSettled(clients.map((client) => client.isOpen ? client.quit() : Promise.resolve()));
}

export async function acquireSharedWsUserConnection(userId: string): Promise<string | null | undefined> {
  if (!env.REALTIME_BUS_URL) return undefined;
  if (!publisher?.isReady) return null;
  const key = `amoria:ws-user:${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
  const leaseId = randomUUID();
  try {
    const acquired = await publisher.eval(
      `local t = redis.call('TIME')
       local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
       redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
       if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
       redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), ARGV[2])
       redis.call('PEXPIRE', KEYS[1], ARGV[4])
       return 1`,
      {
        keys: [key],
        arguments: [
          String(env.WS_MAX_CONNECTIONS_PER_USER),
          leaseId,
          String(WS_LEASE_TTL_MS),
          String(WS_LEASE_TTL_MS + 10_000),
        ],
      },
    );
    if (Number(acquired) !== 1) {
      incrementMetric("amoria_ws_connections_rejected_total", { reason: "shared_user_limit" });
      return null;
    }
    wsUserConnectionLeases.set(leaseId, key);
    return leaseId;
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return null;
  }
}

export async function releaseSharedWsUserConnection(leaseId: string | undefined): Promise<void> {
  if (!leaseId) return;
  const key = wsUserConnectionLeases.get(leaseId);
  wsUserConnectionLeases.delete(leaseId);
  if (!key || !publisher?.isReady) return;
  try { await publisher.zRem(key, leaseId); }
  catch { incrementMetric("amoria_realtime_bus_errors_total"); }
}

async function heartbeatWsUserConnectionLeases(): Promise<void> {
  if (wsLeaseHeartbeatRunning || !publisher?.isReady || wsUserConnectionLeases.size === 0) return;
  wsLeaseHeartbeatRunning = true;
  try {
    const entries = [...wsUserConnectionLeases.entries()];
    const [seconds, microseconds] = await publisher.time();
    const expiresAt = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000) + WS_LEASE_TTL_MS;
    for (let offset = 0; offset < entries.length; offset += 500) {
      const batch = entries.slice(offset, offset + 500);
      const transaction = publisher.multi();
      for (const [leaseId, key] of batch) {
        // XX prevents a heartbeat snapshot from resurrecting a lease that a
        // concurrent socket close already removed.
        transaction.zAdd(key, { score: expiresAt, value: leaseId }, { condition: "XX" });
        transaction.pExpire(key, WS_LEASE_TTL_MS + 10_000);
      }
      await transaction.exec();
    }
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
  } finally {
    wsLeaseHeartbeatRunning = false;
  }
}

export function realtimeBusReady(): boolean {
  return !env.REALTIME_BUS_URL || Boolean(publisher?.isReady && subscriber?.isReady);
}

export async function consumeSharedWsConnectionAttempt(ip: string): Promise<boolean | undefined> {
  if (!env.REALTIME_BUS_URL) return undefined;
  if (!publisher?.isReady) return false;
  const fingerprint = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  try {
    const key = `amoria:ws-attempt:${fingerprint}`;
    const count = await publisher.incr(key);
    if (count === 1) await publisher.pExpire(key, 60_000);
    return count <= 60;
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return false;
  }
}

export async function consumeSharedMessageAttempt(userId: string): Promise<boolean | undefined> {
  if (!env.REALTIME_BUS_URL) return undefined;
  if (!publisher?.isReady) return false;
  const fingerprint = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  try {
    const key = `amoria:message-attempt:${fingerprint}`;
    const count = await publisher.incr(key);
    if (count === 1) await publisher.pExpire(key, 60_000);
    const allowed = count <= 60;
    if (!allowed) incrementMetric("amoria_shared_rate_limit_rejections_total", { scope: "message" });
    return allowed;
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return false;
  }
}

export async function readSharedEphemeralValue(name: string): Promise<string | null | undefined> {
  if (!env.REALTIME_BUS_URL || !publisher?.isReady) return undefined;
  try {
    return await publisher.get(ephemeralKey(name));
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return undefined;
  }
}

export async function writeSharedEphemeralValue(
  name: string,
  value: string,
  ttlMs: number,
): Promise<boolean> {
  if (!env.REALTIME_BUS_URL || !publisher?.isReady || Buffer.byteLength(value, "utf8") > 64 * 1024) {
    return false;
  }
  try {
    await publisher.set(ephemeralKey(name), value, { PX: ttlMs });
    return true;
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return false;
  }
}

export async function acquireSharedEphemeralLock(
  name: string,
  ttlMs: number,
): Promise<string | null | undefined> {
  if (!env.REALTIME_BUS_URL || !publisher?.isReady) return undefined;
  const token = randomUUID();
  try {
    const result = await publisher.set(ephemeralKey(`lock:${name}`), token, { NX: true, PX: ttlMs });
    return result === "OK" ? token : null;
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return undefined;
  }
}

export async function releaseSharedEphemeralLock(name: string, token: string): Promise<void> {
  if (!publisher?.isReady) return;
  try {
    await publisher.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then
         return redis.call('DEL', KEYS[1])
       end
       return 0`,
      { keys: [ephemeralKey(`lock:${name}`)], arguments: [token] },
    );
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
  }
}

export async function claimSharedPresenceHeartbeat(
  userId: string,
  ttlMs: number,
): Promise<boolean | undefined> {
  if (!env.REALTIME_BUS_URL || !publisher?.isReady) return undefined;
  const fingerprint = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  try {
    const result = await publisher.set(`amoria:presence:${fingerprint}`, "1", { NX: true, PX: ttlMs });
    return result === "OK";
  } catch {
    incrementMetric("amoria_realtime_bus_errors_total");
    return undefined;
  }
}

function ephemeralKey(name: string): string {
  if (!/^[a-z0-9:_-]{1,100}$/i.test(name)) throw new Error("invalid_ephemeral_key");
  return `amoria:ephemeral:${name}`;
}
