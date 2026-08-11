import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRES_IN, SERVICE_NAME } from "../config/constants";
import { env } from "../config/env";
import { unauthorized } from "../common/errors";

type AccessTokenPayload = {
  sub: string;
  typ: "access";
  exp: number;
};

export type SignedAccessToken = {
  accessToken: string;
  accessTokenExpiresAt: string;
};

export function signAccessToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      typ: "access",
    },
    env.JWT_SECRET,
    {
      audience: "amoria-mobile",
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      issuer: SERVICE_NAME,
    },
  );
}

export function signAccessTokenWithExpiry(userId: string): SignedAccessToken {
  const accessToken = signAccessToken(userId);
  const decoded = jwt.decode(accessToken);

  if (!decoded || typeof decoded !== "object" || typeof decoded.exp !== "number") {
    throw new Error("Signed access token is missing an expiry");
  }

  return {
    accessToken,
    accessTokenExpiresAt: new Date(decoded.exp * 1000).toISOString(),
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      audience: "amoria-mobile",
      issuer: SERVICE_NAME,
    });

    if (
      typeof decoded !== "object" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.exp !== "number" ||
      decoded.typ !== "access"
    ) {
      throw unauthorized("Invalid access token");
    }

    return {
      sub: decoded.sub,
      typ: "access",
      exp: decoded.exp,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AppError") {
      throw error;
    }
    throw unauthorized("Invalid or expired access token");
  }
}
