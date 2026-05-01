import { AppError } from "../common/errors";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizePassword,
} from "../common/validators";
import { type AuthResponse, type LoginBody, type RegisterBody, toAuthUserProfile } from "./auth.types";
import { createUser, findUserByEmail, uniqueConstraint } from "./auth.repo";
import { signAccessToken } from "./jwt";
import { hashPassword, verifyPassword } from "./passwords";
import { generateAmoriaId } from "../users/amoria-id";

const amoriaIdRetries = 8;

export async function register(input: RegisterBody): Promise<AuthResponse> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const displayName = normalizeDisplayName(input.displayName);
  const passwordHash = await hashPassword(password);

  for (let attempt = 0; attempt < amoriaIdRetries; attempt += 1) {
    try {
      const user = await createUser({
        email,
        passwordHash,
        displayName,
        amoriaId: generateAmoriaId(),
      });

      return {
        accessToken: signAccessToken(user.id),
        user: toAuthUserProfile(user),
      };
    } catch (error) {
      const constraint = uniqueConstraint(error);

      if (constraint?.includes("email")) {
        throw new AppError("email_taken", "Email is already registered", 409, {
          email: "taken",
        });
      }

      if (constraint?.includes("amoria_id")) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError("internal_error", "Could not allocate Amoria ID", 500);
}

export async function login(input: LoginBody): Promise<AuthResponse> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError("invalid_credentials", "Invalid email or password", 401);
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError("invalid_credentials", "Invalid email or password", 401);
  }

  return {
    accessToken: signAccessToken(user.id),
    user: toAuthUserProfile(user),
  };
}
