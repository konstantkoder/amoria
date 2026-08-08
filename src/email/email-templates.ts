export type EmailLocale = "en" | "ru" | "hr";
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
  expires: (minutes: number) => string;
  warning: string;
};

const copy: Record<EmailLocale, Copy> = {
  en: {
    verificationSubject: "Verify your Amoria email",
    verificationIntro: "Use this code to verify your email address:",
    resetSubject: "Reset your Amoria password",
    resetIntro: "Use this code to reset your password:",
    expires: (minutes) => `This code expires in ${minutes} minutes.`,
    warning: "If you did not request this, you can safely ignore this email. Never share this code.",
  },
  ru: {
    verificationSubject: "Подтвердите email в Amoria",
    verificationIntro: "Используйте этот код, чтобы подтвердить адрес электронной почты:",
    resetSubject: "Сброс пароля Amoria",
    resetIntro: "Используйте этот код, чтобы сбросить пароль:",
    expires: (minutes) => `Код действует ${minutes} минут.`,
    warning: "Если вы не запрашивали код, просто проигнорируйте письмо. Никому не сообщайте код.",
  },
  hr: {
    verificationSubject: "Potvrdite svoju Amoria e-poštu",
    verificationIntro: "Upotrijebite ovaj kôd za potvrdu adrese e-pošte:",
    resetSubject: "Ponovno postavljanje Amoria lozinke",
    resetIntro: "Upotrijebite ovaj kôd za ponovno postavljanje lozinke:",
    expires: (minutes) => `Kôd istječe za ${minutes} minuta.`,
    warning: "Ako ovo niste zatražili, slobodno zanemarite poruku. Ne dijelite ovaj kôd.",
  },
};

export function normalizeEmailLocale(locale: unknown): EmailLocale {
  if (typeof locale !== "string") return "en";
  const normalized = locale.trim().toLowerCase().split(/[-_]/)[0];
  return normalized === "ru" || normalized === "hr" ? normalized : "en";
}

export function renderAuthEmail(input: {
  purpose: EmailPurpose;
  locale: EmailLocale;
  code: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const selected = copy[input.locale];
  const isVerification = input.purpose === "verify_email";
  const subject = isVerification ? selected.verificationSubject : selected.resetSubject;
  const intro = isVerification ? selected.verificationIntro : selected.resetIntro;
  const expires = selected.expires(input.expiresInMinutes);

  return {
    subject,
    text: [`Amoria`, "", intro, input.code, "", expires, selected.warning].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;max-width:520px;color:#241c21">',
      '<h1 style="color:#8b3157">Amoria</h1>',
      `<p>${intro}</p>`,
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px">${input.code}</p>`,
      `<p>${expires}</p>`,
      `<p style="color:#6b5b63">${selected.warning}</p>`,
      "</div>",
    ].join(""),
  };
}
