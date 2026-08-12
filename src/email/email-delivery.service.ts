import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import type { RenderedEmail } from "./email-templates";

export type EmailDeliveryFailureKind = "transient" | "permanent";

export class EmailDeliveryError extends Error {
  readonly kind: EmailDeliveryFailureKind;
  readonly safeCode: string;

  constructor(kind: EmailDeliveryFailureKind, safeCode: string) {
    super(kind === "transient" ? "Email delivery is temporarily unavailable" : "Email delivery failed");
    this.name = "EmailDeliveryError";
    this.kind = kind;
    this.safeCode = safeCode;
  }
}

export interface EmailDeliveryService {
  send(to: string, message: RenderedEmail): Promise<void>;
  verify(): Promise<void>;
}

export type SmtpEmailDeliveryConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  username?: string;
  password?: string;
  timeoutMs: number;
  mailFrom: string;
  mailFromName: string;
};

type SmtpErrorShape = {
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
};

const transientNetworkCodes = new Set([
  "ECONNECTION",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ESOCKET",
  "EAI_AGAIN",
]);
const timeoutCodes = new Set(["ETIMEDOUT", "ETIMEOUT"]);
const tlsCodes = new Set([
  "ETLS",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function smtpConfigFromEnv(): SmtpEmailDeliveryConfig {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTls: env.SMTP_REQUIRE_TLS,
    username: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    timeoutMs: env.SMTP_CONNECTION_TIMEOUT_MS,
    mailFrom: env.MAIL_FROM,
    mailFromName: env.MAIL_FROM_NAME,
  };
}

function hasHeaderBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

function isMailbox(value: string): boolean {
  return value.length <= 320
    && !hasHeaderBreak(value)
    && /^[^\s@<>]+@[^\s@<>]+$/.test(value);
}

function validateConfig(config: SmtpEmailDeliveryConfig): void {
  if (!config.host.trim() || hasHeaderBreak(config.host)) {
    throw new EmailDeliveryError("permanent", "smtp_configuration_invalid");
  }
  if (!isMailbox(config.mailFrom) || hasHeaderBreak(config.mailFromName)) {
    throw new EmailDeliveryError("permanent", "smtp_configuration_invalid");
  }
  if (Boolean(config.username) !== Boolean(config.password)) {
    throw new EmailDeliveryError("permanent", "smtp_configuration_invalid");
  }
}

export function classifySmtpFailure(error: unknown): EmailDeliveryError {
  if (error instanceof EmailDeliveryError) return error;
  const shaped = error && typeof error === "object" ? error as SmtpErrorShape : {};
  const code = typeof shaped.code === "string" ? shaped.code.toUpperCase() : "";
  const command = typeof shaped.command === "string" ? shaped.command.toUpperCase() : "";
  const responseCode = typeof shaped.responseCode === "number" ? shaped.responseCode : undefined;

  if (code === "EAUTH") return new EmailDeliveryError("permanent", "smtp_authentication_failed");
  if (tlsCodes.has(code)) return new EmailDeliveryError("permanent", "smtp_tls_failed");
  if (responseCode && responseCode >= 400 && responseCode < 500) {
    return new EmailDeliveryError("transient", "smtp_temporary_rejection");
  }
  if (code === "EENVELOPE" || (command === "RCPT TO" && responseCode && responseCode >= 500)) {
    return new EmailDeliveryError("permanent", "smtp_recipient_rejected");
  }
  if (responseCode && responseCode >= 500) {
    return new EmailDeliveryError("permanent", "smtp_permanent_rejection");
  }
  if (timeoutCodes.has(code)) return new EmailDeliveryError("transient", "smtp_timeout");
  if (transientNetworkCodes.has(code)) {
    return new EmailDeliveryError("transient", "smtp_connection_unavailable");
  }
  return new EmailDeliveryError("transient", "smtp_transport_unavailable");
}

function acceptedAddress(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && "address" in value) {
    const address = (value as { address?: unknown }).address;
    return typeof address === "string" ? address.toLowerCase() : undefined;
  }
  return undefined;
}

export class SmtpEmailDelivery implements EmailDeliveryService {
  private readonly transporter: Transporter;
  private readonly config: SmtpEmailDeliveryConfig;

  constructor(config: SmtpEmailDeliveryConfig = smtpConfigFromEnv()) {
    validateConfig(config);
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      connectionTimeout: config.timeoutMs,
      greetingTimeout: config.timeoutMs,
      socketTimeout: config.timeoutMs,
      ...(config.username
        ? { auth: { user: config.username, pass: config.password } }
        : {}),
    });
  }

  async send(to: string, message: RenderedEmail): Promise<void> {
    if (!isMailbox(to) || !message.subject || hasHeaderBreak(message.subject) || !message.text || !message.html) {
      throw new EmailDeliveryError("permanent", "smtp_message_invalid");
    }
    try {
      const info = await this.transporter.sendMail({
        from: { address: this.config.mailFrom, name: this.config.mailFromName },
        to: { address: to },
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      const accepted = Array.isArray(info.accepted)
        ? info.accepted.map(acceptedAddress).filter(Boolean)
        : [];
      const rejected = Array.isArray(info.rejected) ? info.rejected : [];
      if (!accepted.includes(to.toLowerCase()) || rejected.length > 0) {
        throw new EmailDeliveryError("permanent", "smtp_recipient_rejected");
      }
    } catch (error) {
      throw classifySmtpFailure(error);
    }
  }

  async verify(): Promise<void> {
    try {
      await this.transporter.verify();
    } catch (error) {
      throw classifySmtpFailure(error);
    }
  }
}

let deliveryService: EmailDeliveryService | undefined;

export function emailDeliveryService(): EmailDeliveryService {
  deliveryService ??= new SmtpEmailDelivery();
  return deliveryService;
}

export async function verifyEmailDeliveryReadiness(): Promise<void> {
  await emailDeliveryService().verify();
}

export function setEmailDeliveryServiceForTests(service: EmailDeliveryService | undefined): void {
  if (!env.isTest) throw new Error("Email delivery can only be replaced in tests");
  deliveryService = service;
}
