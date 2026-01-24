#!/usr/bin/env node
/**
 * Amoria L10N apply + audit (text-only workflow for Codex).
 * - Applies predefined value changes to locale JSON files under src/i18n/locales
 * - Does NOT change keys or structure (only overwrites existing string values)
 * - Audits: missing/extra keys vs en.json, placeholders {x}, \n count, mixed Cyrillic+Latin
 *
 * Run:
 *   node scripts/l10n_apply_and_audit.js
 */

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(process.cwd(), "src", "i18n", "locales");
const BASE_FILE = "en.json";

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, text, "utf8");
}
function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObject(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
function getByPath(obj, dotKey) {
  if (isObject(obj) && dotKey in obj) {
    return { ok: true, value: obj[dotKey] };
  }
  const parts = dotKey.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!isObject(cur) || !(p in cur)) return { ok: false, value: undefined };
    cur = cur[p];
  }
  return { ok: true, value: cur };
}
function setByPath(obj, dotKey, value) {
  if (isObject(obj) && dotKey in obj) {
    obj[dotKey] = value;
    return true;
  }
  const parts = dotKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!isObject(cur) || !(p in cur) || !isObject(cur[p])) return false; // do NOT create structure
    cur = cur[p];
  }
  const last = parts[parts.length - 1];
  if (!isObject(cur) || !(last in cur)) return false;
  cur[last] = value;
  return true;
}
function extractPlaceholders(str) {
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  const set = new Set();
  let m;
  while ((m = re.exec(str)) !== null) set.add(m[1]);
  return [...set].sort();
}
function countNewlines(str) {
  // Count occurrences of literal "\n" in the *string content* (already parsed)
  // Parsed string contains actual newline characters, so count them.
  const m = str.match(/\n/g);
  return m ? m.length : 0;
}
function hasCyrillic(str) { return /[\u0400-\u04FF]/.test(str); }
function hasLatin(str) { return /[A-Za-z]/.test(str); }

const MIX_WHITELIST = ["Firebase", "email", "Email", "OK", "SMS", "GPS", "km", "URL", "HTTP", "HTTPS"];
function isMixedScript(str) {
  if (!(hasCyrillic(str) && hasLatin(str))) return false;
  let cleaned = str;
  for (const t of MIX_WHITELIST) cleaned = cleaned.split(t).join("");
  return hasCyrillic(cleaned) && hasLatin(cleaned);
}

// FINAL CHANGES (merged: "first layer" + "second layer")
const CHANGES = {
  en: {
    "auth.error": "Authentication error",
    "auth.firebaseDisabledLogin": "Firebase isn't set up. Sign in is unavailable.",
    "auth.firebaseDisabledRegister": "Firebase isn't set up. Sign up is unavailable.",
    "auth.emailRequired": "Enter your email.",
    "auth.emailInvalid": "Invalid email.",
    "auth.passwordRequired": "Enter your password.",
    "auth.loginError": "Couldn't sign in.",
    "auth.registerError": "Couldn't sign up.",
    "auth.emailInUse": "Email already in use. Please sign in.",
    "modal.language.title": "Select language",
    "feed.previewSubtitle": "Full: profile & chat.",
    "now.promptSubtitle": "Messages show nearby.",
    "now.placeholder": "What's on your mind…",
    "feed.answerPlaceholder": "Answer (max {max})",
    "feed.questionHint": "Answer in the \"Question\" tab below.",
    "ads.filterTitle": "Country & city",
    "now.firebaseTitle": "Firebase not set up",
    "rooms.firebaseTitle": "Firebase not set up",
    "icebreaker.title": "First message idea:"
  },

  bs: {
    "menu.languageCurrent": "Jezik: {code}",
    "now.promptSubtitle": "Poruke u blizini.",
    "feed.previewSubtitle": "Puna: profil i chat.",
    "feed.answerPlaceholder": "Odgovor (max {max})",
    "tabs.feed": "Objave",
    "feed.title": "Objave",
    "icebreaker.goal.chat.2": "Da pričamo sat vremena, o čemu bismo sigurno pričali?",
    "ads.untitled": "Bez naslova",
    "question.save": "SPREMI",
    "question.saved": "SPREMLJENO",
    "question.saving": "SPREMANJE...",
    "profile.goal.dating": "Upoznavanje",
    "profile.goal.chat": "Ćaskanje",
    "profile.goal.casual": "Neformalno / flert",
    "profile.goal.sex": "Seks",
    "profile.mood.happy": "Sretan",
    "profile.mood.chill": "Opušteno",
    "profile.mysteryBadge": "Tajni režim"
  },

  cs: {
    "menu.languageCurrent": "Jazyk: {code}",
    "now.promptSubtitle": "Zprávy poblíž.",
    "feed.previewSubtitle": "Plná: profil a chat.",
    "feed.answerPlaceholder": "Odpověď (max {max})",
    "auth.registerTitle": "Registrace",
    "legal.privacy.title": "Zásady soukromí",
    "now.firebaseTitle": "Firebase není nastaven",
    "rooms.firebaseTitle": "Firebase není nastaven"
  },

  da: {
    "menu.languageCurrent": "Sprog: {code}",
    "now.promptSubtitle": "Beskeder i nærheden.",
    "feed.previewSubtitle": "Fuld: profil & chat.",
    "feed.answerPlaceholder": "Svar (max {max})",
    "icebreaker.goal.dating.1": "Hej! Date: kaffe, gåtur eller noget særligt?",
    "tabs.feed": "Opslag",
    "feed.title": "Opslag",
    "question.save": "GEM",
    "question.saving": "GEMMER...",
    "profile.goal.casual": "Uformelt / flirt",
    "profile.goal.sex": "Sex"
  },

  de: {
    "menu.languageCurrent": "Sprache: {code}",
    "now.promptSubtitle": "Nachrichten in der Nähe.",
    "feed.previewSubtitle": "Voll: Profil & Chat.",
    "feed.answerPlaceholder": "Antwort (max. {max})",
    "now.placeholder": "Was geht dir gerade durch den Kopf…",
    "geo.permissionRequired": "Standort nötig (in den Handy-Einstellungen aktivieren).",
    "rooms.noPhotoChat": "Chat ohne Fotos, ortsgebunden. Nur mit Leuten in der Nähe.",
    "icebreaker.title": "Erste Nachricht:",
    "icebreaker.goal.dating.1": "Hi! Date: Kaffee, Spaziergang oder was Besonderes?",
    "icebreaker.goal.friends.1": "Hi! Gesellschaft: Kaffee, Spaziergang oder Brettspiel?",
    "icebreaker.goal.chat.2": "1 Stunde chatten: worüber würden wir sicher reden?",
    "icebreaker.mood.chill.2": "Nur chillen: Film, Musik oder Spaziergang?",
    "icebreaker.mood.happy.2": "Gute Laune! Was hat dich heute am glücklichsten gemacht?",
    "question.saving": "SPEICHERE...",
    "profile.flirt18": "Flirt 18+",
    "flirt.title": "Flirt 18+",
    "ads.untitled": "Ohne Titel"
  },

  el: {
    "menu.languageCurrent": "Γλώσσα: {code}",
    "now.promptSubtitle": "Μηνύματα κοντά.",
    "feed.previewSubtitle": "Πλήρες: προφίλ & chat.",
    "feed.answerPlaceholder": "Απάντηση (μέγ. {max})",
    "now.placeholder": "Τι σκέφτεσαι τώρα…",
    "feed.questionHint": "Απάντησε στην καρτέλα «Ερώτηση» κάτω.",
    "ads.filterTitle": "Χώρα & πόλη",
    "now.firebaseTitle": "Firebase δεν έχει ρυθμιστεί",
    "rooms.firebaseTitle": "Firebase δεν έχει ρυθμιστεί",
    "rooms.noRooms": "Δεν βρέθηκαν δωμάτια κοντά. Διάλεξε μέρος για να φτιάξεις ένα.",
    "rooms.noPhotoChat": "Chat χωρίς φωτογραφίες, δεμένο με μέρος. Μίλα μόνο με κοντινούς."
  },

  es: {
    "menu.languageCurrent": "Idioma: {code}",
    "now.promptSubtitle": "Mensajes cerca.",
    "feed.previewSubtitle": "Completo: perfil y chat.",
    "feed.answerPlaceholder": "Respuesta (máx. {max})",
    "now.placeholder": "¿Qué piensas ahora…?",
    "feed.questionHint": "Responde en la pestaña \"Pregunta\" abajo.",
    "ads.filterTitle": "País & ciudad",
    "ads.publishFailedTitle": "No se pudo publicar",
    "now.sendFailedTitle": "Error al enviar",
    "icebreaker.title": "Idea: primer mensaje:",
    "question.save": "GUARDAR",
    "question.saved": "GUARDADO",
    "question.saving": "GUARDANDO...",
    "profile.mood.chill": "Relax"
  },

  fi: {
    "menu.languageCurrent": "Kieli: {code}",
    "now.promptSubtitle": "Viestit lähellä.",
    "feed.previewSubtitle": "Täysi: profiili & chat.",
    "feed.answerPlaceholder": "Vastaus (max {max})",
    "dm.title": "Keskustelu: {name}",
    "icebreaker.goal.dating.1": "Hei! Treffit: kahvi, kävely vai jotain erikoista?",
    "icebreaker.mood.chill.2": "Vain chill: leffa, musa vai kävely?",
    "icebreaker.mood.happy.2": "Hyvä fiilis! Mikä teki sinut onnellisimmaksi tänään?"
  },

  fr: {
    "menu.languageCurrent": "Langue : {code}",
    "now.promptSubtitle": "Messages à proximité.",
    "feed.previewSubtitle": "Complet : profil & chat.",
    "feed.answerPlaceholder": "Réponse (max {max})",
    "auth.registerTitle": "Inscription",
    "ads.filterTitle": "Pays & ville",
    "errorBoundary.title": "Une erreur est survenue",
    "geo.permissionRequired": "Localisation requise (active-la dans les réglages).",
    "rooms.noPhotoChat": "Chat sans photos, lié à un lieu. Parle avec ceux près de toi.",
    "icebreaker.title": "Premier message :",
    "icebreaker.goal.dating.1": "Salut ! Date : café, balade ou un truc original ?",
    "icebreaker.goal.friends.1": "Salut ! Compagnie : café, balade ou jeux ?",
    "icebreaker.goal.long_term.1": "Salut ! Le plus important chez les gens près de toi ?",
    "icebreaker.mood.chill.2": "Juste chill : film, musique ou balade ?",
    "icebreaker.mood.happy.2": "Bonne vibe ! Qu’est-ce qui t’a rendu le plus heureux aujourd’hui ?",
    "question.save": "ENREGISTRER",
    "question.saved": "ENREGISTRÉ",
    "question.saving": "ENREGISTRE...",
    "profile.goal.casual": "Décontracté / flirt",
    "profile.goal.unknown": "Objectif non défini",
    "profile.mood.happy": "Heureux",
    "profile.mood.chill": "Détente",
    "profile.mood.active": "Actif",
    "profile.mood.serious": "Sérieux",
    "profile.mood.party": "Fête",
    "profile.mood.unknown": "Humeur non définie",
    "profile.flirt18": "Flirt 18+",
    "flirt.title": "Flirt 18+"
  },

  hr: {
    "menu.languageCurrent": "Jezik: {code}",
    "now.promptSubtitle": "Poruke u blizini.",
    "feed.previewSubtitle": "Puna: profil i chat.",
    "feed.answerPlaceholder": "Odgovor (max {max})",
    "tabs.chats": "Chatovi",
    "question.save": "SPREMI",
    "question.saved": "SPREMLJENO",
    "question.saving": "SPREMANJE...",
    "profile.goal.dating": "Upoznavanje",
    "profile.goal.chat": "Ćaskanje",
    "profile.goal.unknown": "Cilj nije postavljen",
    "profile.mood.happy": "Sretan",
    "profile.mood.chill": "Opušteno",
    "profile.mood.active": "Aktivan",
    "profile.mood.serious": "Ozbiljan",
    "profile.mood.party": "Zabava"
  },

  hu: {
    "menu.languageCurrent": "Nyelv: {code}",
    "now.promptSubtitle": "Üzenetek a közelben.",
    "feed.previewSubtitle": "Teljes: profil & chat.",
    "feed.answerPlaceholder": "Válasz (max {max})",
    "ads.filterTitle": "Ország & város",
    "now.firebaseTitle": "Firebase nincs beállítva",
    "rooms.firebaseTitle": "Firebase nincs beállítva",
    "question.save": "MENTÉS",
    "question.saving": "MENTÉS..."
  },

  it: {
    "menu.languageCurrent": "Lingua: {code}",
    "now.promptSubtitle": "Messaggi nelle vicinanze.",
    "feed.previewSubtitle": "Completo: profilo & chat.",
    "feed.answerPlaceholder": "Risposta (max {max})",
    "now.placeholder": "A cosa pensi ora…",
    "geo.permissionRequired": "Serve la posizione (attivala nelle impostazioni).",
    "icebreaker.goal.dating.1": "Ciao! Date: caffè, passeggiata o qualcosa di diverso?",
    "icebreaker.mood.chill.2": "Solo relax: film, musica o passeggiata?",
    "tabs.feed": "Bacheca",
    "feed.title": "Bacheca",
    "question.saving": "SALVATAGGIO...",
    "profile.mood.chill": "Relax",
    "profile.flirt18": "Flirt 18+",
    "flirt.title": "Flirt 18+"
  },

  nl: {
    "menu.languageCurrent": "Taal: {code}",
    "now.promptSubtitle": "Berichten in de buurt.",
    "feed.previewSubtitle": "Volledig: profiel & chat.",
    "feed.answerPlaceholder": "Antwoord (max {max})",
    "ads.filterTitle": "Land & stad",
    "rooms.noPhotoChat": "Chat zonder foto's, gekoppeld aan een plek. Praat alleen met mensen dichtbij.",
    "icebreaker.title": "Eerste bericht:",
    "icebreaker.goal.dating.1": "Hoi! Date: koffie, wandeling of iets bijzonders?",
    "icebreaker.goal.friends.1": "Hoi! Samen: koffie, wandelen of bordspel?",
    "icebreaker.goal.chat.2": "Een uur chatten: waar praten we zeker over?",
    "icebreaker.mood.chill.2": "Gewoon chillen: film, muziek of wandeling?",
    "icebreaker.mood.happy.2": "Goede vibe! Waar werd je vandaag het blijst van?",
    "tabs.feed": "Tijdlijn",
    "feed.title": "Tijdlijn",
    "question.save": "OPSLAAN",
    "question.saved": "OPGESLAGEN",
    "question.saving": "OPSLAAN...",
    "profile.mood.happy": "Blij",
    "profile.mood.chill": "Relax"
  },

  no: {
    "menu.languageCurrent": "Språk: {code}",
    "now.promptSubtitle": "Meldinger i nærheten.",
    "feed.previewSubtitle": "Full: profil & chat.",
    "feed.answerPlaceholder": "Svar (maks {max})",
    "icebreaker.title": "Første melding:",
    "question.save": "LAGRE",
    "question.saving": "LAGRER...",
    "profile.goal.sex": "Sex"
  },

  pl: {
    "menu.languageCurrent": "Język: {code}",
    "now.promptSubtitle": "Wiadomości w pobliżu.",
    "feed.previewSubtitle": "Pełna: profil i chat.",
    "feed.answerPlaceholder": "Odpowiedź (max {max})",
    "auth.registerTitle": "Rejestracja",
    "ads.filterTitle": "Kraj & miasto",
    "now.firebaseTitle": "Firebase nie jest ustawiony",
    "rooms.firebaseTitle": "Firebase nie jest ustawiony",
    "icebreaker.title": "Pierwsza wiadomość:",
    "icebreaker.goal.friends.1": "Cześć! Towarzystwo: kawa, spacer czy planszówki?",
    "icebreaker.mood.happy.2": "Dobry nastrój! Co dało Ci dziś najwięcej radości?",
    "question.save": "ZAPISZ",
    "question.saved": "ZAPISANO",
    "question.saving": "ZAPISYWANIE...",
    "profile.mood.chill": "Relaks"
  },

  pt: {
    "menu.languageCurrent": "Idioma: {code}",
    "now.promptSubtitle": "Mensagens por perto.",
    "feed.previewSubtitle": "Completo: perfil & chat.",
    "feed.answerPlaceholder": "Resposta (máx. {max})",
    "ads.filterTitle": "País & cidade",
    "icebreaker.title": "1ª mensagem:",
    "icebreaker.goal.dating.1": "Olá! Date: café, passeio ou algo diferente?",
    "icebreaker.goal.chat.2": "Uma hora de papo: sobre o que falaríamos com certeza?",
    "icebreaker.mood.chill.2": "Só relax: filme, música ou caminhada?",
    "tabs.feed": "Publicações",
    "feed.title": "Publicações",
    "question.save": "GUARDAR",
    "question.saving": "A GUARDAR...",
    "flirt.title": "Flirt 18+"
  },

  ro: {
    "menu.languageCurrent": "Limbă: {code}",
    "now.promptSubtitle": "Mesaje în apropiere.",
    "feed.previewSubtitle": "Complet: profil & chat.",
    "feed.answerPlaceholder": "Răspuns (max {max})",
    "legal.privacy.title": "Politica confidențialității",
    "ads.filterTitle": "Țară & oraș",
    "icebreaker.goal.dating.1": "Hei! Întâlnire: cafea, plimbare sau ceva diferit?",
    "question.save": "SALVEAZĂ",
    "question.saving": "SE SALVEAZĂ...",
    "profile.mood.chill": "Relaxat",
    "profile.mood.party": "Petrecere"
  },

  ru: {
    "menu.languageCurrent": "Язык: {code}",
    "now.promptSubtitle": "Сообщения рядом.",
    "feed.previewSubtitle": "Полная: профиль и чат.",
    "feed.answerPlaceholder": "Ответ (до {max})",
    "auth.registerTitle": "Регистрация",
    "ads.filterTitle": "Страна и город",
    "geo.permissionRequired": "Нужен доступ к геолокации (включите в настройках телефона).",
    "icebreaker.goal.dating.1": "Привет! Свидание: кофе, прогулка или что-то необычное?"
  },

  sk: {
    "menu.languageCurrent": "Jazyk: {code}",
    "now.promptSubtitle": "Správy v okolí.",
    "feed.previewSubtitle": "Plná: profil a chat.",
    "feed.answerPlaceholder": "Odpoveď (max {max})",
    "auth.registerTitle": "Registrácia",
    "legal.privacy.title": "Zásady súkromia",
    "now.firebaseTitle": "Firebase nie je nastavený",
    "rooms.firebaseTitle": "Firebase nie je nastavený"
  },

  sl: {
    "menu.languageCurrent": "Jezik: {code}",
    "now.promptSubtitle": "Sporočila v bližini.",
    "feed.previewSubtitle": "Polno: profil in klepet.",
    "feed.answerPlaceholder": "Odgovor (max {max})",
    "rooms.noPhotoChat": "Klepet brez fotk, vezan na kraj. Klepetaj le z bližnjimi.",
    "question.save": "SHRANI",
    "question.saved": "SHRANJENO",
    "question.saving": "SHRANJEVANJE...",
    "profile.goal.unknown": "Cilj ni izbran",
    "profile.mood.happy": "Vesel",
    "profile.mood.chill": "Sproščeno",
    "profile.mood.active": "Aktiven",
    "profile.mood.serious": "Resen",
    "profile.mood.party": "Zabava",
    "profile.mood.unknown": "Razpoloženje ni nastavljeno"
  },

  sr: {
    "menu.languageCurrent": "Jezik: {code}",
    "now.promptSubtitle": "Poruke u blizini.",
    "feed.previewSubtitle": "Puna: profil i chat.",
    "feed.answerPlaceholder": "Odgovor (max {max})",
    "tabs.feed": "Objave",
    "feed.title": "Objave",
    "ads.untitled": "Bez naslova",
    "question.save": "SAČUVAJ",
    "question.saved": "SAČUVANO",
    "profile.goal.casual": "Neobavezno / flert",
    "profile.goal.sex": "Seks",
    "profile.mood.chill": "Opušteno",
    "profile.mood.active": "Aktivan"
  },

  sv: {
    "menu.languageCurrent": "Språk: {code}",
    "now.promptSubtitle": "Meddelanden i närheten.",
    "feed.previewSubtitle": "Full: profil & chatt.",
    "feed.answerPlaceholder": "Svar (max {max})",
    "icebreaker.title": "Första meddelandet:",
    "question.saving": "SPARAR...",
    "profile.mysteryBadge": "Mysterie-läge"
  },

  tr: {
    "menu.languageCurrent": "Dil: {code}",
    "now.promptSubtitle": "Yakındaki mesajlar.",
    "feed.previewSubtitle": "Tam: profil ve sohbet.",
    "feed.answerPlaceholder": "Yanıt (en fazla {max})",
    "icebreaker.goal.dating.1": "Merhaba! Randevu: kahve mi, yürüyüş mü, yoksa farklı bir şey mi?",
    "icebreaker.goal.friends.1": "Merhaba! Arkadaş: kahve, yürüyüş mü, masa oyunu mu?",
    "question.save": "KAYDET",
    "question.saved": "KAYDEDİLDİ",
    "question.saving": "KAYDEDİLİYOR...",
    "profile.goal.dating": "Randevu",
    "profile.flirt18": "Flört 18+",
    "flirt.title": "Flört 18+"
  },

  uk: {
    "menu.languageCurrent": "Мова: {code}",
    "now.promptSubtitle": "Повідомлення поруч.",
    "feed.previewSubtitle": "Повна: профіль і чат.",
    "feed.answerPlaceholder": "Відповідь (до {max})",
    "auth.registerTitle": "Реєстрація",
    "ads.filterTitle": "Країна та місто",
    "icebreaker.title": "Перше повідомлення:",
    "icebreaker.goal.dating.1": "Привіт! Побачення: кава, прогулянка чи щось незвичне?",
    "question.save": "ЗБЕРЕГТИ",
    "question.saved": "ЗБЕРЕЖЕНО",
    "question.saving": "ЗБЕРІГАЮ...",
    "profile.goal.unknown": "Мета не вибрана",
    "profile.mood.chill": "Релакс",
    "profile.flirt18": "Флірт 18+",
    "flirt.title": "Флірт 18+"
  }
};

function listJsonFiles(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => path.join(dir, f));
}

function auditLocales(baseObj, baseFlat, localeFilePath, localeObj) {
  const localeName = path.basename(localeFilePath);
  const locale = localeName.replace(/\.json$/i, "");

  const baseKeys = new Set(Object.keys(baseFlat));
  const locFlat = flatten(localeObj);
  const locKeys = new Set(Object.keys(locFlat));

  const missing = [...baseKeys].filter(k => !locKeys.has(k));
  const extra = [...locKeys].filter(k => !baseKeys.has(k));

  const placeholderMismatch = [];
  const newlineMismatch = [];
  const mixedScript = [];

  for (const k of baseKeys) {
    if (!locKeys.has(k)) continue;
    const bv = baseFlat[k];
    const lv = locFlat[k];
    if (typeof bv !== "string" || typeof lv !== "string") continue;

    const bp = extractPlaceholders(bv);
    const lp = extractPlaceholders(lv);
    if (bp.join(",") !== lp.join(",")) {
      placeholderMismatch.push({ key: k, base: bp, locale: lp });
    }

    const bn = countNewlines(bv);
    const ln = countNewlines(lv);
    if (bn !== ln) {
      newlineMismatch.push({ key: k, baseNewlines: bn, localeNewlines: ln });
    }

    if (isMixedScript(lv)) {
      mixedScript.push({ key: k, sample: lv.slice(0, 120) + (lv.length > 120 ? "…" : "") });
    }
  }

  return { locale, file: localeName, missing, extra, placeholderMismatch, newlineMismatch, mixedScript };
}

function main() {
  if (!exists(LOCALES_DIR)) {
    console.error(`NOT FOUND: ${LOCALES_DIR}`);
    console.error("Expected locales at src/i18n/locales. Fix path or run from repo root.");
    process.exit(2);
  }

  const basePath = path.join(LOCALES_DIR, BASE_FILE);
  if (!exists(basePath)) {
    console.error(`Base not found: ${basePath}`);
    process.exit(2);
  }

  // 1) Apply changes to en.json first (so audit uses updated base)
  const baseObj = readJson(basePath);
  const baseChanges = CHANGES.en || {};
  let enApplied = 0;
  let enMissingKeys = 0;
  for (const [k, v] of Object.entries(baseChanges)) {
    const ok = setByPath(baseObj, k, v);
    if (ok) enApplied++;
    else enMissingKeys++;
  }
  writeJson(basePath, baseObj);

  const updatedBaseObj = readJson(basePath);
  const updatedBaseFlat = flatten(updatedBaseObj);

  // 2) Apply changes to other locales
  const files = listJsonFiles(LOCALES_DIR).filter(p => path.basename(p) !== BASE_FILE);

  const applyReport = [];
  for (const filePath of files) {
    const name = path.basename(filePath);
    const locale = name.replace(/\.json$/i, "");
    const changes = CHANGES[locale];
    if (!changes) continue;

    const obj = readJson(filePath);
    let applied = 0;
    const missingKeys = [];
    for (const [k, v] of Object.entries(changes)) {
      const ok = setByPath(obj, k, v);
      if (ok) applied++;
      else missingKeys.push(k);
    }
    writeJson(filePath, obj);
    applyReport.push({ locale, file: name, applied, missingKeys });
  }

  // 3) Audit
  const auditSummary = [];
  const placeholderMismatchAll = [];
  const newlineMismatchAll = [];
  const missingKeysAll = [];
  const extraKeysAll = [];
  const mixedScriptAll = [];

  for (const filePath of files) {
    const obj = readJson(filePath);
    const res = auditLocales(updatedBaseObj, updatedBaseFlat, filePath, obj);

    const errors =
      res.missing.length +
      res.extra.length +
      res.placeholderMismatch.length +
      res.newlineMismatch.length;

    auditSummary.push({ locale: res.locale, file: res.file, errors });

    if (res.missing.length) missingKeysAll.push({ locale: res.locale, file: res.file, keys: res.missing });
    if (res.extra.length) extraKeysAll.push({ locale: res.locale, file: res.file, keys: res.extra });
    if (res.placeholderMismatch.length) placeholderMismatchAll.push(...res.placeholderMismatch.map(x => ({ locale: res.locale, file: res.file, ...x })));
    if (res.newlineMismatch.length) newlineMismatchAll.push(...res.newlineMismatch.map(x => ({ locale: res.locale, file: res.file, ...x })));
    if (res.mixedScript.length) mixedScriptAll.push(...res.mixedScript.map(x => ({ locale: res.locale, file: res.file, ...x })));
  }

  // Print apply report
  console.log("=== APPLY REPORT ===");
  console.log(`en.json applied: ${enApplied} (missing keys in en: ${enMissingKeys})`);
  for (const r of applyReport.sort((a, b) => a.locale.localeCompare(b.locale))) {
    console.log(`${r.locale.padEnd(6)} applied=${String(r.applied).padStart(3)} file=${r.file}${r.missingKeys.length ? " missingKeys=" + r.missingKeys.length : ""}`);
  }
  const applyMissing = applyReport.filter(r => r.missingKeys.length);
  if (applyMissing.length) {
    console.log("\n=== APPLY WARN: keys not found (not created, per rules) ===");
    for (const r of applyMissing) {
      console.log(`\n${r.locale} (${r.file}) missing keys:`);
      for (const k of r.missingKeys) console.log(" - " + k);
    }
  }

  // Print audit report
  console.log("\nL10N AUDIT REPORT");
  console.log(`Base: ${BASE_FILE}`);
  console.log(`Dir:  ${LOCALES_DIR}`);

  console.log("\n=== SUMMARY ===");
  for (const s of auditSummary.sort((a, b) => b.errors - a.errors)) {
    console.log(`${s.locale.padEnd(6)} ${String(s.errors).padStart(5)}  ${s.file}`);
  }

  function printSection(title, items, limit = 50) {
    if (!items.length) return;
    console.log(`\n=== ${title} (${items.length}) ===`);
    for (const item of items.slice(0, limit)) console.log(JSON.stringify(item, null, 2));
    if (items.length > limit) console.log(`... +${items.length - limit} more`);
  }

  printSection("MISSING KEYS", missingKeysAll);
  printSection("EXTRA KEYS", extraKeysAll);
  printSection("PLACEHOLDER MISMATCH", placeholderMismatchAll);
  printSection("NEWLINE COUNT MISMATCH", newlineMismatchAll);
  printSection("MIXED SCRIPT (CYR+LAT)", mixedScriptAll);

  const totalIssues =
    missingKeysAll.reduce((a, x) => a + x.keys.length, 0) +
    extraKeysAll.reduce((a, x) => a + x.keys.length, 0) +
    placeholderMismatchAll.length +
    newlineMismatchAll.length;

  if (totalIssues === 0) {
    console.log("\nOK: No key/placeholder/newline issues detected.");
    process.exit(0);
  } else {
    console.log(`\nNOT OK: Total issues = ${totalIssues}`);
    process.exit(1);
  }
}

main();
