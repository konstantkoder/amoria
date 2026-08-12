export const DETERMINISTIC_TEXT_POLICY_VERSION = "amoria_deterministic_text_safety_v1";

export const DETERMINISTIC_TEXT_CATEGORIES = [
  "credential_theft",
  "phishing",
  "scam_financial_pressure",
  "blackmail",
  "coercion",
  "sexual_coercion",
  "doxxing_threat",
] as const;

export type DeterministicTextCategory = (typeof DETERMINISTIC_TEXT_CATEGORIES)[number];
export type DeterministicTextOutcome = "flag" | "hold" | "restrict";

export type DeterministicTextFinding = {
  category: DeterministicTextCategory;
  outcome: DeterministicTextOutcome;
  signals: string[];
};

const REQUEST = [
  /\b(?:send|give|tell|share|forward|enter|type|provide|reply with|show|do this)\b/u,
  /(?:пришл|присл|отправ|дай|дайте|скажи|скажите|сообщи|сообщите|введи|введите|покажи|покажите|сделай|нужен|нужно|обязан|обязана)/u,
  /\b(?:posalji|poslati|daj|reci|podijeli|proslijedi|unesi|upisi|pokazi|ucini|trebam|moras|morate)\b/u,
];

const STRONG_CREDENTIAL = [
  /\b(?:password|passcode|otp|verification code|security code|recovery code|login code|one[ -]time code|sms code)\b/u,
  /(?:парол|код(?:а|ом)?\s+(?:подтвержден|верификац|безопасност|входа|восстановлен)|(?:одноразов|смс|sms)\p{L}*\s+код)/u,
  /\b(?:lozink\p{L}*|jednokratni kod|verifikacijski kod|sigurnosni kod|kod za prijav\p{L}*|kod iz sms\p{L}*)\b/u,
];

const ACCOUNT_ACTION = [
  /\b(?:verify|confirm|secure|unlock|restore|login|log in|sign in)\b/u,
  /(?:подтверд|проверь|проверить|защит|разблок|войд|войти|вход)/u,
  /\b(?:potvrdi|potvrditi|verificir\p{L}*|provjeri|zastiti|otkljuc\p{L}*|prijavi|prijava)\b/u,
];

const URL_OR_REDIRECT = [
  /(?:https?:\/\/|www\.)[^\s]+/u,
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|net|org|app|info|biz|xyz|site|online|click|link)(?:\b|[\/:?#])/u,
  /\b(?:click|open|follow|login|verify|sign in) (?:this |the )?(?:link|here)\b/u,
  /(?:перейд|войд|открой|нажми)\p{L}*\s+(?:по\s+)?(?:этой\s+)?ссылк/u,
  /\b(?:klikni|otvori|prati|prijavi se) (?:na )?(?:ovu |tu )?(?:poveznicu|link|ovdje)\b/u,
];

const MONEY = [
  /\b(?:send|transfer|pay|payment|money|cash|fee|gift card|crypto|bitcoin|investment|bank account|card)\b/u,
  /(?:перевед|перевести|отправ\p{L}*\s+деньг|деньг|оплат|платеж|платёж|взнос|подарочн\p{L}*\s+карт|крипт|биткоин|инвест|банковск\p{L}*\s+счет|банковск\p{L}*\s+счёт)/u,
  /\b(?:posalji novac|uplati|prebaci|novac|placanje|platiti|naknada|poklon kartic\p{L}*|kripto|bitcoin|ulaganj\p{L}*|bankovni racun|kartica)\b/u,
];

const FINANCIAL_PRESSURE = [
  /\b(?:urgent(?:ly)?|immediately|right now|must|required|first|before (?:we )?meet|emergency)\b/u,
  /(?:срочно|немедленно|прямо сейчас|обязан|обязана|должен|должна|сначала|до встречи|чрезвычайн)/u,
  /\b(?:hitno|odmah|moras|morate|trebas|obavezno|prvo|prije susreta|prije sastanka)\b/u,
];

const SCAM_SPECIFIC = [
  /\b(?:advance fee|guaranteed (?:profit|return)|risk[ -]free (?:profit|return)|pay(?:ment)? required before (?:we )?meet|gift card payment)\b/u,
  /(?:авансов\p{L}*\s+(?:плат|взнос)|гарантированн\p{L}*\s+(?:прибыл|доход)|оплат\p{L}*\s+до встречи)/u,
  /\b(?:predujam|zajamcena dobit|garantirana dobit|placanje prije (?:susreta|sastanka))\b/u,
];

const CONDITIONAL_PRESSURE = [
  /\b(?:or else|otherwise|if you (?:do not|don't|won't)|unless you)\b/u,
  /(?:иначе|если\s+не|а\s+то)/u,
  /\b(?:inace|ako ne|ili cu|ili cemo)\b/u,
];

const DISCLOSURE = [
  /\b(?:publish|post|expose|leak|reveal)\b|\b(?:share|send)\b.*\b(?:everyone|public|online)\b|\btell everyone\b/u,
  /(?:опубликую|выложу|разошлю|расскажу всем|покажу всем|раскрою|солью)/u,
  /\b(?:objavit\p{L}*|razotkrit\p{L}*|otkrit\p{L}*|podijelit\p{L}*|poslat cu|reci cu svima)\b/u,
];

const GENERAL_THREAT = [
  /\b(?:hurt|harm|ruin|destroy|kill|find you|you(?:'ll| will) regret)\b/u,
  /(?:наврежу|уничтожу|убью|найду тебя|пожалеешь)/u,
  /\b(?:nauditi|ozlijediti|unistiti|ubiti|pronaci cu te|pozalit ces)\b/u,
];

const PRIVATE_DATA = [
  /\b(?:private (?:information|data)|home address|address|phone number|documents?|passport|location|where you live|secret)\b/u,
  /(?:личн\p{L}*\s+данн|частн\p{L}*\s+информац|домашн\p{L}*\s+адрес|адрес|номер телефона|документ|паспорт|местоположен|где ты живешь|где ты живёшь|секрет)/u,
  /\b(?:privatn\p{L}* (?:podac\p{L}*|informacij\p{L}*)|kucn\p{L}* adres\p{L}*|adres\p{L}*|broj telefona|dokument\p{L}*|putovnic\p{L}*|lokacij\p{L}*|gdje zivis|tajn\p{L}*)\b/u,
];

const PRIVATE_MEDIA = [
  /\b(?:private|intimate|explicit|nude|naked)\b.*\b(?:photos?|pictures?|videos?|content)\b/u,
  /(?:личн|частн|интимн|обнаженн|гол)\p{L}*\s+(?:фото|фотограф|видео)/u,
  /\b(?:privatn\p{L}*|intimn\p{L}*|gol\p{L}*|obnazen\p{L}*)\s+(?:fotograf\p{L}*|slik\p{L}*|video)\b/u,
];

const SEXUAL_REQUEST = [
  /\b(?:send|show|share|give)\b.*\b(?:explicit|nude|naked|sexual|intimate)\b.*\b(?:photos?|pictures?|videos?|content)?\b/u,
  /(?:пришл|присл|отправ|покаж|дай)\p{L}*.*(?:интимн|обнаженн|гол)\p{L}*\s+(?:фото|фотограф|видео)/u,
  /\b(?:posalji|poslati|pokazi|podijeli|daj)\b.*\b(?:gol\p{L}*|obnazen\p{L}*|seksualn\p{L}*|intimn\p{L}*)\s+(?:fotograf\p{L}*|slik\p{L}*|video)\b/u,
];

const DEMAND = [
  /\b(?:must|have to|required|do it now)\b/u,
  /(?:обязан|обязана|должен|должна|сделай сейчас)/u,
  /\b(?:moras|morate|trebas|obavezno|ucini to)\b/u,
];

export function detectDeterministicTextSafety(text: string): DeterministicTextFinding[] {
  const normalized = normalize(text);
  const request = matchesAny(normalized, REQUEST);
  const strongCredential = matchesAny(normalized, STRONG_CREDENTIAL);
  const accountAction = matchesAny(normalized, ACCOUNT_ACTION);
  const redirect = matchesAny(normalized, URL_OR_REDIRECT);
  const money = matchesAny(normalized, MONEY);
  const financialPressure = matchesAny(normalized, FINANCIAL_PRESSURE);
  const conditionalPressure = matchesAny(normalized, CONDITIONAL_PRESSURE);
  const disclosure = matchesAny(normalized, DISCLOSURE);
  const generalThreat = matchesAny(normalized, GENERAL_THREAT);
  const privateData = matchesAny(normalized, PRIVATE_DATA);
  const privateMedia = matchesAny(normalized, PRIVATE_MEDIA);
  const sexualRequest = matchesAny(normalized, SEXUAL_REQUEST);
  const demand = matchesAny(normalized, DEMAND);
  const findings: DeterministicTextFinding[] = [];

  if (request && strongCredential) {
    findings.push(finding("credential_theft", "hold", ["credential_context", "request_or_demand"]));
  }
  if ((accountAction || strongCredential) && redirect) {
    findings.push(finding("phishing", "hold", ["account_or_credential_context", "url_or_redirect"]));
  }
  if ((money && financialPressure) || matchesAny(normalized, SCAM_SPECIFIC)) {
    findings.push(finding("scam_financial_pressure", "flag", ["financial_context", "pressure_or_scam_claim"]));
  }
  if (disclosure && conditionalPressure && (privateData || privateMedia || request || demand)) {
    findings.push(finding("blackmail", "restrict", ["conditional_pressure", "threatened_disclosure"]));
  }
  if (conditionalPressure && (generalThreat || disclosure) && (request || demand)) {
    findings.push(finding("coercion", "hold", ["request_or_demand", "conditional_threat"]));
  }
  if (sexualRequest && (conditionalPressure || demand || generalThreat)) {
    findings.push(finding("sexual_coercion", "hold", ["sexual_request", "pressure_or_threat"]));
  }
  if (privateData && ((disclosure && conditionalPressure) || generalThreat)) {
    findings.push(finding("doxxing_threat", "restrict", ["private_data_context", "threatened_disclosure"]));
  }

  return findings;
}

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, " ")
    .replace(/[’‘]/gu, "'")
    .toLocaleLowerCase("und")
    .replace(/[čć]/gu, "c")
    .replace(/š/gu, "s")
    .replace(/ž/gu, "z")
    .replace(/đ/gu, "d")
    .replace(/\s+/gu, " ")
    .trim();
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function finding(
  category: DeterministicTextCategory,
  outcome: DeterministicTextOutcome,
  signals: string[],
): DeterministicTextFinding {
  return { category, outcome, signals };
}
