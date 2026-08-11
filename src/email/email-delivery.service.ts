import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import type { RenderedEmail } from "./email-templates";

export interface EmailDeliveryService {
  send(to: string, message: RenderedEmail): Promise<void>;
}

export class SmtpEmailDelivery implements EmailDeliveryService {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: env.SMTP_REQUIRE_TLS,
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: env.SMTP_CONNECTION_TIMEOUT_MS * 2,
      ...(env.SMTP_USER
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } }
        : {}),
    });
  }

  async send(to: string, message: RenderedEmail): Promise<void> {
    await this.transporter.sendMail({
      from: { address: env.MAIL_FROM, name: env.MAIL_FROM_NAME },
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

let deliveryService: EmailDeliveryService | undefined;

export function emailDeliveryService(): EmailDeliveryService {
  deliveryService ??= new SmtpEmailDelivery();
  return deliveryService;
}

export function setEmailDeliveryServiceForTests(service: EmailDeliveryService | undefined): void {
  if (!env.isTest) throw new Error("Email delivery can only be replaced in tests");
  deliveryService = service;
}
