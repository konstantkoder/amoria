import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "./client";

async function main(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, "migrations");
  await migrate(db, { migrationsFolder });
}

main()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
