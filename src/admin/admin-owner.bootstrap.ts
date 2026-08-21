import { closeDb } from "../db/client";
import { createOwnerAdminAccount } from "./admin-owner.service";

async function main(): Promise<void> {
  const result = await createOwnerAdminAccount({
    email: process.env.ADMIN_OWNER_EMAIL,
    password: process.env.ADMIN_OWNER_PASSWORD,
    displayName: process.env.ADMIN_OWNER_DISPLAY_NAME,
  });

  console.log("Owner admin account is ready.");
  console.log(`email=${result.email}`);
  console.log(`displayName=${result.displayName}`);
  console.log(`userId=${result.userId}`);
  console.log(`amoriaId=${result.amoriaId}`);
  console.log(`adminUserId=${result.adminUserId}`);
  console.log(`createdUser=${result.createdUser}`);

  if (result.generatedPassword) {
    console.log("passwordSource=secure_credentials_file");
    console.log(`credentialsFile=${result.credentialsFile}`);
  } else {
    console.log("passwordSource=ADMIN_OWNER_PASSWORD");
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
