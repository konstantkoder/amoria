import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, pool } from "./client";

const MIGRATION_LOCK_NAME = "amoria_schema_migrations";

async function main(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, "migrations");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [MIGRATION_LOCK_NAME]);
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [MIGRATION_LOCK_NAME]);
    } finally {
      client.release();
    }
  }
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
