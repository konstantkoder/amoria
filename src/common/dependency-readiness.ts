export const DEPENDENCY_READINESS_TIMEOUT_MS = 3_000;

export async function boundedDependencyStatus(
  check: () => Promise<void>,
  timeoutMs = DEPENDENCY_READINESS_TIMEOUT_MS,
): Promise<"ok" | "error"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("readiness_timeout")), timeoutMs);
      }),
    ]);
    return "ok";
  } catch {
    return "error";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
