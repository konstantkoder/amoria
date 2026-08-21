import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { forbidden } from "../common/errors";
import { ipMatchesCidr, isLoopbackAddress, parseCidr, parseIpAddress } from "../common/security/ip-cidr";
import { env } from "../config/env";

const allowedCidrs = env.ADMIN_ALLOWED_CIDRS.map(parseCidr);

export function assertAdminNetworkAccess(request: Pick<FastifyRequest, "ip">): void {
  if (env.ADMIN_NETWORK_ACCESS_MODE === "disabled") {
    throw forbidden("Admin network access is disabled");
  }

  try {
    if (env.ADMIN_NETWORK_ACCESS_MODE === "development_local") {
      if (isLoopbackAddress(request.ip)) return;
    } else {
      const ip = parseIpAddress(request.ip);
      if (allowedCidrs.some((cidr) => ipMatchesCidr(ip, cidr))) return;
    }
  } catch {
    // Invalid or unexpected peer addresses fail closed.
  }
  throw forbidden("Admin network access is not allowed");
}

export const requireAdminNetworkAccess: preHandlerHookHandler = async (request) => {
  assertAdminNetworkAccess(request);
};
