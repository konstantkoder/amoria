import dns from "node:dns/promises";
import { env } from "../config/env";

type DnsResolver = {
  resolveMx(domain: string): Promise<readonly { exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<readonly string[]>;
  resolve6(domain: string): Promise<readonly string[]>;
};

type CacheEntry = { valid: boolean; expiresAt: number };

const permanentDnsCodes = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NOTFOUND", "NODATA"]);

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}

export class EmailDomainValidationError extends Error {
  constructor(readonly kind: "invalid" | "transient") {
    super(kind === "invalid" ? "Email domain cannot receive mail" : "Email domain lookup is temporarily unavailable");
    this.name = "EmailDomainValidationError";
  }
}

export class EmailDomainValidationService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly resolver: DnsResolver = dns,
    private readonly timeoutMs = env.EMAIL_DOMAIN_DNS_TIMEOUT_MS,
    private readonly cacheTtlMs = env.EMAIL_DOMAIN_CACHE_TTL_SEC * 1000,
  ) {}

  async assertUsable(domain: string): Promise<void> {
    const normalized = domain.trim().toLowerCase().replace(/\.$/, "");
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.valid) throw new EmailDomainValidationError("invalid");
      return;
    }

    try {
      const mx = await this.withTimeout(this.resolver.resolveMx(normalized));
      if (mx.length > 0) {
        const hasUsableMx = mx.some(
          (record) => record.exchange.trim().replace(/\.$/, "").length > 0,
        );
        this.cache.set(normalized, { valid: hasUsableMx, expiresAt: Date.now() + this.cacheTtlMs });
        if (hasUsableMx) return;
        throw new EmailDomainValidationError("invalid");
      }
    } catch (error) {
      if (error instanceof EmailDomainValidationError) throw error;
      if (!permanentDnsCodes.has(errorCode(error) ?? "")) {
        throw new EmailDomainValidationError("transient");
      }
    }

    const fallback = await Promise.allSettled([
      this.withTimeout(this.resolver.resolve4(normalized)),
      this.withTimeout(this.resolver.resolve6(normalized)),
    ]);
    if (fallback.some((result) => result.status === "fulfilled" && result.value.length > 0)) {
      this.cache.set(normalized, { valid: true, expiresAt: Date.now() + this.cacheTtlMs });
      return;
    }

    const hasTransientFailure = fallback.some(
      (result) => result.status === "rejected" && !permanentDnsCodes.has(errorCode(result.reason) ?? ""),
    );
    if (hasTransientFailure) throw new EmailDomainValidationError("transient");

    this.cache.set(normalized, { valid: false, expiresAt: Date.now() + this.cacheTtlMs });
    throw new EmailDomainValidationError("invalid");
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            const error = new Error("DNS lookup timed out") as Error & { code: string };
            error.code = "ETIMEOUT";
            reject(error);
          }, this.timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
