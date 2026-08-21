import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRES_IN, SERVICE_NAME } from "../config/constants";
import { env } from "../config/env";
import { unauthorized } from "../common/errors";

export type AdminAccessTokenPayload = {
  sub: string;
  typ: "admin_access";
  auid: string;
  aver: number;
  ver: number;
  exp: number;
};

export function signAdminAccessTokenWithExpiry(input: {
  userId: string;
  adminUserId: string;
  adminSessionVersion: number;
  userAuthVersion: number;
}): { accessToken: string; accessTokenExpiresAt: string } {
  const accessToken = jwt.sign(
    {
      sub: input.userId,
      typ: "admin_access",
      auid: input.adminUserId,
      aver: input.adminSessionVersion,
      ver: input.userAuthVersion,
    },
    env.JWT_SECRET,
    { audience: "amoria-admin", expiresIn: ACCESS_TOKEN_EXPIRES_IN, issuer: SERVICE_NAME },
  );
  const decoded = jwt.decode(accessToken);
  if (!decoded || typeof decoded !== "object" || typeof decoded.exp !== "number") {
    throw new Error("Signed Admin access token is missing an expiry");
  }
  return { accessToken, accessTokenExpiresAt: new Date(decoded.exp * 1000).toISOString() };
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      audience: "amoria-admin",
      issuer: SERVICE_NAME,
    });
    if (
      typeof decoded !== "object" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.auid !== "string" ||
      decoded.typ !== "admin_access" ||
      !Number.isInteger(decoded.aver) || Number(decoded.aver) < 0 ||
      !Number.isInteger(decoded.ver) || Number(decoded.ver) < 0 ||
      typeof decoded.exp !== "number"
    ) throw unauthorized("Invalid Admin access token");
    return {
      sub: decoded.sub,
      auid: decoded.auid,
      typ: "admin_access",
      aver: Number(decoded.aver),
      ver: Number(decoded.ver),
      exp: decoded.exp,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AppError") throw error;
    throw unauthorized("Invalid or expired Admin access token");
  }
}
