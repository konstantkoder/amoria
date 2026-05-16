import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const compiledBootstrap = path.join(root, "dist", "src", "admin", "admin-owner.bootstrap.js");
const sourceBootstrap = path.join(root, "src", "admin", "admin-owner.bootstrap.ts");

const useCompiled =
  process.env.NODE_ENV === "production" && existsSync(compiledBootstrap);

let args;

if (useCompiled) {
  args = [compiledBootstrap];
} else if (existsSync(sourceBootstrap)) {
  args = ["--import", "tsx", sourceBootstrap];
} else if (existsSync(compiledBootstrap)) {
  args = [compiledBootstrap];
} else {
  console.error("Could not find the owner admin bootstrap entrypoint.");
  process.exit(1);
}

const child = spawn(process.execPath, args, {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Owner admin bootstrap process exited with signal ${signal}.`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
