import { buildApp } from "./app";
import { env } from "./config/env";
import { closeDb } from "./db/client";
import {
  TURN_BASED_MAINTENANCE_INTERVAL_MS,
} from "./config/constants";
import { runMaintenance } from "./together/together-turn-based.service";

const app = buildApp();
let turnBasedMaintenanceTimer: NodeJS.Timeout | undefined;

async function start(): Promise<void> {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });
    turnBasedMaintenanceTimer = setInterval(() => {
      void runMaintenance().catch((error: unknown) => {
        app.log.error({ err: error }, "Together turn-based maintenance failed");
      });
    }, TURN_BASED_MAINTENANCE_INTERVAL_MS);
    turnBasedMaintenanceTimer.unref();
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    await closeDb();
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");
  if (turnBasedMaintenanceTimer) clearInterval(turnBasedMaintenanceTimer);
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
