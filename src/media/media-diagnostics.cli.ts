import { closeDb } from "../db/client";
import { diagnoseMediaOrphans } from "./media-diagnostics.service";

function parseLimit(args: string[]): number {
  const inline = args.find((arg) => arg.startsWith("--limit="));
  const flagIndex = args.indexOf("--limit");
  const raw = inline?.slice("--limit=".length) ?? (flagIndex >= 0 ? args[flagIndex + 1] : undefined);
  if (raw === undefined) {
    return 1000;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error("--limit must be an integer between 1 and 10000");
  }
  return limit;
}

async function main(): Promise<void> {
  const result = await diagnoseMediaOrphans(parseLimit(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Media diagnostics failed");
    process.exitCode = 1;
  })
  .finally(closeDb);
