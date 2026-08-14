import { buildApp } from "./app";
import { env } from "./config/env";
import { closeDb } from "./db/client";
import {
  TURN_BASED_MAINTENANCE_INTERVAL_MS,
} from "./config/constants";
import { runMaintenance } from "./together/together-turn-based.service";
import { runTogetherQueueMaintenance } from "./together/together.repo";
import { runPushMaintenance } from "./notifications/push-delivery.service";
import { runAccountDeletionMaintenance } from "./users/account-deletion.service";
import { startRealtimeBus, stopRealtimeBus } from "./realtime/realtime-bus";
import { runRetentionMaintenance } from "./workers/retention.worker";
import { revalidateConnectedUserAccess } from "./realtime/ws-access-revalidation";
import { recordPotentialDatabaseFailure } from "./observability/metrics";
import {
  recordWorkerLoopFailure,
  recordWorkerLoopSuccess,
  startWorkerObservabilityServer,
  stopWorkerObservabilityServer,
} from "./workers/worker-observability.server";

const app = env.AMORIA_PROCESS_ROLE === "worker" ? undefined : buildApp();
let turnBasedMaintenanceTimer: NodeJS.Timeout | undefined;
let togetherQueueMaintenanceTimer: NodeJS.Timeout | undefined;
let pushMaintenanceTimer: NodeJS.Timeout | undefined;
let accountDeletionMaintenanceTimer: NodeJS.Timeout | undefined;
let retentionMaintenanceTimer: NodeJS.Timeout | undefined;
let wsAccessRevalidationTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;

function scheduleWorker(
  run: () => Promise<unknown>,
  intervalMs: number,
  worker: string,
  failureMessage: string,
): NodeJS.Timeout {
  let running = false;
  const tick = async () => {
    if (running || shuttingDown) return;
    running = true;
    try {
      await run();
      recordWorkerLoopSuccess(worker);
    }
    catch (error) {
      recordPotentialDatabaseFailure(error);
      recordWorkerLoopFailure(worker);
      if (app) app.log.error({ err: error }, failureMessage);
      else console.error(failureMessage, error);
    }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  if (env.AMORIA_PROCESS_ROLE === "all") timer.unref();
  return timer;
}

async function start(): Promise<void> {
  try {
    if (app) {
      await startRealtimeBus();
      await app.listen({ host: "0.0.0.0", port: env.PORT });
      wsAccessRevalidationTimer = scheduleWorker(
        revalidateConnectedUserAccess,
        env.WS_ACCESS_REVALIDATION_INTERVAL_MS,
        "ws_access_revalidation",
        "WebSocket access revalidation failed",
      );
    }
    if (env.AMORIA_PROCESS_ROLE !== "api") {
      if (env.AMORIA_PROCESS_ROLE === "worker") await startWorkerObservabilityServer();
      turnBasedMaintenanceTimer = scheduleWorker(runMaintenance, TURN_BASED_MAINTENANCE_INTERVAL_MS, "turn_based", "Together maintenance failed");
      togetherQueueMaintenanceTimer = scheduleWorker(
        runTogetherQueueMaintenance,
        env.TOGETHER_QUEUE_MAINTENANCE_INTERVAL_MS,
        "together_queue",
        "Together queue maintenance failed",
      );
      pushMaintenanceTimer = scheduleWorker(runPushMaintenance, env.PUSH_WORKER_INTERVAL_MS, "push", "Push maintenance failed");
      accountDeletionMaintenanceTimer = scheduleWorker(runAccountDeletionMaintenance, env.ACCOUNT_DELETION_WORKER_INTERVAL_MS, "account_deletion", "Account deletion maintenance failed");
      retentionMaintenanceTimer = scheduleWorker(runRetentionMaintenance, env.RETENTION_WORKER_INTERVAL_MS, "retention", "Retention maintenance failed");
    }
    if (app) app.log.info({ processRole: env.AMORIA_PROCESS_ROLE }, "Amoria process started");
    else console.info("Amoria worker process started");
  } catch (error) {
    if (app) app.log.error({ err: error }, "Failed to start server");
    else console.error("Failed to start worker", error);
    await stopWorkerObservabilityServer().catch(() => undefined);
    await closeDb();
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (app) app.log.info({ signal }, "Shutting down");
  else console.info(`Shutting down worker (${signal})`);
  if (turnBasedMaintenanceTimer) clearInterval(turnBasedMaintenanceTimer);
  if (togetherQueueMaintenanceTimer) clearInterval(togetherQueueMaintenanceTimer);
  if (pushMaintenanceTimer) clearInterval(pushMaintenanceTimer);
  if (accountDeletionMaintenanceTimer) clearInterval(accountDeletionMaintenanceTimer);
  if (retentionMaintenanceTimer) clearInterval(retentionMaintenanceTimer);
  if (wsAccessRevalidationTimer) clearInterval(wsAccessRevalidationTimer);
  if (app) await app.close();
  if (env.AMORIA_PROCESS_ROLE === "worker") await stopWorkerObservabilityServer();
  await stopRealtimeBus();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});

void start();
