import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { env } from "../config/env";
import type { LocalTextSignals } from "./text-moderation.policy";

type WorkerResult = {
  requestId: string;
  ok: boolean;
  signals?: LocalTextSignals;
  durationMs?: number;
  error?: string;
};

export type LocalTextModerationResult = {
  signals: LocalTextSignals;
  durationMs: number;
};

type Pending = {
  resolve: (value: LocalTextModerationResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class LocalTextModerationClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readonly pending = new Map<string, Pending>();

  isConfigured(): boolean {
    return Boolean(
      env.TEXT_MODERATION_ENABLED &&
      env.TEXT_MODERATION_PYTHON &&
      env.TEXT_MODERATION_MODEL_DIR,
    );
  }

  async classify(messageId: string, text: string): Promise<LocalTextModerationResult> {
    if (!this.isConfigured()) throw new Error("text_model_not_configured");
    if (this.pending.size >= 32) throw new Error("text_model_queue_full");

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.ensureStarted();
        return await this.send(messageId, text);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("text_model_failed");
        this.stop(lastError);
      }
    }
    throw lastError ?? new Error("text_model_failed");
  }

  async warmUp(): Promise<void> {
    if (!this.isConfigured()) throw new Error("text_model_not_configured");
    await this.ensureStarted();
  }

  stop(reason = new Error("text_model_stopped")): void {
    const child = this.child;
    this.child = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
    this.pending.clear();
    if (child && !child.killed) child.kill();
  }

  private ensureStarted(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    const workerPath = path.resolve(process.cwd(), "moderation-worker", "text_worker.py");
    const child = spawn(env.TEXT_MODERATION_PYTHON!, [workerPath], {
      env: {
        ...process.env,
        TEXT_MODERATION_MODEL_DIR: env.TEXT_MODERATION_MODEL_DIR!,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    const startupTimeout = setTimeout(() => {
      this.readyReject?.(new Error("text_model_start_timeout"));
      this.stop(new Error("text_model_start_timeout"));
    }, 120_000);
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(line, startupTimeout));
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(startupTimeout);
      this.readyReject?.(error);
      this.stop(error);
    });
    child.once("exit", () => {
      clearTimeout(startupTimeout);
      this.readyReject?.(new Error("text_model_worker_exited"));
      if (this.child === child) this.stop(new Error("text_model_worker_exited"));
    });
    return this.readyPromise;
  }

  private send(messageId: string, text: string): Promise<LocalTextModerationResult> {
    const child = this.child;
    if (!child?.stdin.writable) return Promise.reject(new Error("text_model_worker_unavailable"));
    const requestId = randomUUID();
    return new Promise<LocalTextModerationResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("text_model_inference_timeout"));
      }, env.TEXT_MODERATION_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timeout });
      child.stdin.write(`${JSON.stringify({ requestId, messageId, text })}\n`, "utf8", (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(requestId);
        pending.reject(error);
      });
    });
  }

  private handleLine(line: string, startupTimeout: NodeJS.Timeout): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (payload.event === "ready") {
      clearTimeout(startupTimeout);
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }
    const result = payload as WorkerResult;
    const pending = this.pending.get(String(result.requestId ?? ""));
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(result.requestId);
    if (!result.ok || !result.signals) {
      pending.reject(new Error(result.error ?? "text_model_inference_failed"));
      return;
    }
    pending.resolve({
      signals: result.signals,
      durationMs: Number(result.durationMs ?? 0),
    });
  }
}

export const localTextModerationClient = new LocalTextModerationClient();
