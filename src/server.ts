import { buildApp } from "./app";
import { env } from "./config/env";
import { closeDb } from "./db/client";
import {
  TURN_BASED_MAINTENANCE_INTERVAL_MS,
} from "./config/constants";
import { runMaintenance } from "./together/together-turn-based.service";
import { localTextModerationClient } from "./moderation/local-text-moderation.client";
import { runPushMaintenance } from "./notifications/push-delivery.service";
import { runAccountDeletionMaintenance } from "./users/account-deletion.service";

const app = buildApp();
let turnBasedMaintenanceTimer: NodeJS.Timeout | undefined;
let pushMaintenanceTimer: NodeJS.Timeout | undefined;
let accountDeletionMaintenanceTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;

function scheduleWorker(run: () => Promise<unknown>, intervalMs: number, failureMessage: string): NodeJS.Timeout {
  let running = false;
  const tick = async () => {
    if (running || shuttingDown) return;
    running = true;
    try { await run(); }
    catch (error) { app.log.error({ err: error }, failureMessage); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref();
  return timer;
}

async function start(): Promise<void> {
  try {
    if (env.isProduction) await localTextModerationClient.warmUp();
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });
    turnBasedMaintenanceTimer = scheduleWorker(runMaintenance, TURN_BASED_MAINTENANCE_INTERVAL_MS, "Together maintenance failed");
    pushMaintenanceTimer = scheduleWorker(runPushMaintenance, env.PUSH_WORKER_INTERVAL_MS, "Push maintenance failed");
    accountDeletionMaintenanceTimer = scheduleWorker(runAccountDeletionMaintenance, env.ACCOUNT_DELETION_WORKER_INTERVAL_MS, "Account deletion maintenance failed");
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    await closeDb();
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  if (turnBasedMaintenanceTimer) clearInterval(turnBasedMaintenanceTimer);
  if (pushMaintenanceTimer) clearInterval(pushMaintenanceTimer);
  if (accountDeletionMaintenanceTimer) clearInterval(accountDeletionMaintenanceTimer);
  localTextModerationClient.stop(new Error("server_shutdown"));
  await app.close();
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
