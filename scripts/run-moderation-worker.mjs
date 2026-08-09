import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: false, quiet: true });

const defaultPython = process.platform === "win32"
  ? "F:\\Dev\\Amoria-Models\\opennsfw-onnx-0.1.0\\Scripts\\python.exe"
  : "python3";
const python = process.env.MODERATION_PYTHON?.trim() || defaultPython;
if (process.platform === "win32" && !existsSync(python)) {
  console.error(`Moderation Python runtime was not found at ${python}. Run scripts/install-local-moderation-model.ps1 first.`);
  process.exit(1);
}

const worker = path.resolve(process.cwd(), "moderation-worker", "worker.py");
const child = spawn(python, [worker, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Moderation worker exited with signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
