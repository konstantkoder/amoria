import { buildApp } from "./app";
import { env } from "./config/env";
import { closeDb } from "./db/client";

const app = buildApp();

async function start(): Promise<void> {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    await closeDb();
    process.exit(1);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down");
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
