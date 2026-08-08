import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
}

function parseDomains(contents: string): string[] {
  return contents
    .split(/[\r\n,]+/)
    .map((line) => line.replace(/#.*/, ""))
    .map(normalizeDomain)
    .filter(Boolean);
}

export class DisposableEmailDomainService {
  private readonly domains: ReadonlySet<string>;

  constructor(domains?: Iterable<string>) {
    if (domains) {
      this.domains = new Set([...domains].map(normalizeDomain).filter(Boolean));
      return;
    }

    const filePath = path.resolve(__dirname, "disposable-domains.txt");
    const local = fs.existsSync(filePath) ? parseDomains(fs.readFileSync(filePath, "utf8")) : [];
    this.domains = new Set([
      ...local,
      ...parseDomains(env.DISPOSABLE_EMAIL_DOMAIN_OVERRIDES),
    ]);
  }

  isBlocked(domain: string): boolean {
    const normalized = normalizeDomain(domain);
    if (!normalized) return false;
    return [...this.domains].some(
      (blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`),
    );
  }
}
