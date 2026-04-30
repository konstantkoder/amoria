import bcrypt from "bcryptjs";

type Argon2Module = {
  argon2id: number;
  hash(password: string, options: {
    type: number;
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  }): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
};

let argon2: Argon2Module | undefined;

try {
  // Argon2 is preferred, but bcrypt keeps the API portable if native argon2
  // bindings are unavailable on a target host.
  argon2 = require("argon2") as Argon2Module;
} catch {
  argon2 = undefined;
}

const bcryptCost = 12;

export async function hashPassword(password: string): Promise<string> {
  if (argon2) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  return bcrypt.hash(password, bcryptCost);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (passwordHash.startsWith("$argon2") && argon2) {
    return argon2.verify(passwordHash, password);
  }

  return bcrypt.compare(password, passwordHash);
}
