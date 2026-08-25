import catalog from "./auth-email-copy.catalog.json";
import { normalizeAppLocale, type AppLocale } from "../i18n/app-locales";

export type EmailLocale = AppLocale;
export type EmailPurpose = "verify_email" | "password_reset";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

type Copy = {
  verificationSubject: string;
  verificationIntro: string;
  resetSubject: string;
  resetIntro: string;
  expires: string;
  warning: string;
};

const copy = catalog as Record<EmailLocale, Copy>;

export function normalizeEmailLocale(locale: unknown): EmailLocale {
  return normalizeAppLocale(locale);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function renderAuthEmail(input: {
  purpose: EmailPurpose;
  locale: EmailLocale;
  code: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const selected = copy[input.locale] ?? copy.en;
  const isVerification = input.purpose === "verify_email";
  const subject = isVerification ? selected.verificationSubject : selected.resetSubject;
  const intro = isVerification ? selected.verificationIntro : selected.resetIntro;
  const expires = selected.expires.replace("{minutes}", new Intl.NumberFormat(input.locale).format(input.expiresInMinutes));

  return {
    subject,
    text: ["Amoria", "", intro, input.code, "", expires, selected.warning].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:520px;color:#241c21">',
      '<h1 style="color:#8b3157">Amoria</h1>',
      `<p>${escapeHtml(intro)}</p>`,
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px">${escapeHtml(input.code)}</p>`,
      `<p>${escapeHtml(expires)}</p>`,
      `<p style="color:#6b5b63">${escapeHtml(selected.warning)}</p>`,
      "</div>",
    ].join(""),
  };
}
