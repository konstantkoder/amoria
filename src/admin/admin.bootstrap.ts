import { closeDb } from "../db/client";
import * as adminService from "./admin.service";

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const result = await adminService.bootstrapOwners({
    amoriaIds: parseList(process.env.ADMIN_BOOTSTRAP_AMORIA_IDS),
    userIds: parseList(process.env.ADMIN_BOOTSTRAP_USER_IDS),
  });

  console.log("Admin bootstrap completed.");
  console.log(`Roles ensured: ${result.roleKeys.join(", ")}`);
  for (const user of result.usersPromoted) {
    console.log(`Owner admin: userId=${user.userId} amoriaId=${user.amoriaId} adminUserId=${user.adminUserId}`);
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
