import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { type NewUserRow, type UserRow, users } from "../db/schema";

export type UniqueConstraint = "users_email_unique" | "users_amoria_id_unique" | string;

export function uniqueConstraint(error: unknown): UniqueConstraint | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  ) {
    return (error as { constraint?: string }).constraint;
  }

  return undefined;
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function createUser(input: NewUserRow): Promise<UserRow> {
  const [created] = await db.insert(users).values(input).returning();
  return created;
}
