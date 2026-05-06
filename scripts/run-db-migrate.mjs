import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const compiledMigration = path.join(root, "dist", "src", "db", "migrate.js");
const sourceMigration = path.join(root, "src", "db", "migrate.ts");

const useCompiled =
  process.env.NODE_ENV === "production" && existsSync(compiledMigration);

let args;

if (useCompiled) {
  args = [compiledMigration];
} else if (existsSync(sourceMigration)) {
  args = ["--import", "tsx", sourceMigration];
} else if (existsSync(compiledMigration)) {
  args = [compiledMigration];
} else {
  console.error("Could not find a database migration entrypoint.");
  process.exit(1);
}

const child = spawn(process.execPath, args, {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Migration process exited with signal ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
