import fs from "fs";
import path from "path";

type Dict = Record<string, string>;
type Updates = Record<string, Dict>;

const baseDir = path.join(process.cwd(), "src", "i18n", "locales");

// Топ-ключи, которые чаще всего "TOO LONG".
// ВАЖНО: ключи не трогаем, меняем только значения.
// ВАЖНО: плейсхолдеры {name}/{max} оставляем.
const updates: Updates = {
  en: {
    "feed.adultModeHint": "18+ hidden. Enable 18+ in Profile.",
    "voiceIntro.subtitle": "Hear {name}'s voice.",
    "now.promptSubtitle": "Visible nearby.",
    "chats.empty": "Your chats will appear here.",
    "feed.previewSubtitle": "Full: profile + chat.",
    "voiceIntro.demoNote": "Demo. Record intro later.",
    "ads.textPlaceholder": "About you + who you seek…",
    "rooms.placeInfo": "Rooms are location-based. Join only if nearby.",
    "feed.answerPlaceholder": "Answer (max {max} chars)",
  },

  ru: {
    "feed.adultModeHint": "18+ скрыт. Включи 18+ в профиле.",
    "voiceIntro.subtitle": "Голос {name}.",
    "now.promptSubtitle": "Видно рядом.",
    "chats.empty": "Чаты появятся здесь.",
    "feed.previewSubtitle": "Полная: профиль и чат.",
    "voiceIntro.demoNote": "Демо-режим. Интро позже.",
    "ads.textPlaceholder": "О себе и кого ищешь…",
    "rooms.placeInfo": "Комнаты по локации. Вход — рядом.",
    "feed.answerPlaceholder": "Ответ (до {max} знаков)",
  },

  uk: {
    "feed.adultModeHint": "18+ приховано. Увімкни 18+ у профілі.",
    "voiceIntro.subtitle": "Голос {name}.",
    "now.promptSubtitle": "Видно поруч.",
    "chats.empty": "Чати будуть тут.",
    "feed.previewSubtitle": "Повна: профіль і чат.",
    "voiceIntro.demoNote": "Демо-режим. Інтро пізніше.",
    "ads.textPlaceholder": "Про себе й кого шукаєш…",
    "rooms.placeInfo": "Кімнати за локацією. Вхід — поруч.",
    "feed.answerPlaceholder": "Відповідь (до {max} знаків)",
  },

  hr: {
    "feed.adultModeHint": "18+ skriven. Uključi 18+ u profilu.",
    "voiceIntro.subtitle": "Glas {name}.",
    "now.promptSubtitle": "Vidljivo u blizini.",
    "chats.empty": "Chatovi će biti ovdje.",
    "feed.previewSubtitle": "Puna: profil i chat.",
    "voiceIntro.demoNote": "Demo mod. Snimi intro kasnije.",
    "ads.textPlaceholder": "O tebi i koga tražiš…",
    "rooms.placeInfo": "Sobe po lokaciji. Ulaz samo blizu.",
    "feed.answerPlaceholder": "Odgovor (do {max} znakova)",
  },

  bs: {
    "feed.adultModeHint": "18+ sadržaj je skriven. Uključi 18+ u profilu.",
    "voiceIntro.subtitle": "Glas {name}.",
    "now.promptSubtitle": "Vidljivo u blizini.",
    "chats.empty": "Chatovi će biti ovdje.",
    "feed.previewSubtitle": "Puna: profil i chat.",
    "voiceIntro.demoNote": "Demo režim. Snimi intro kasnije.",
    "ads.textPlaceholder": "O tebi i koga tražiš…",
    "rooms.placeInfo": "Sobe su po lokaciji. Ulaz samo blizu.",
    "feed.answerPlaceholder": "Odgovor (do {max} znakova)",
  },

  sr: {
    "feed.adultModeHint": "18+ сакривен. Укључи 18+ у профилу.",
    "voiceIntro.subtitle": "Глас {name}.",
    "now.promptSubtitle": "Видљиво у близини.",
    "chats.empty": "Чатови ће бити овде.",
    "feed.previewSubtitle": "Пуна: профил и чат.",
    "voiceIntro.demoNote": "Демо режим. Сними интро касније.",
    "ads.textPlaceholder": "О себи и кога тражиш…",
    "rooms.placeInfo": "Собе по локацији. Улаз само близу.",
    "feed.answerPlaceholder": "Одговор (до {max} знакова)",
  },

  sl: {
    "feed.adultModeHint": "18+ skrito. Vklopi 18+ v profilu.",
    "voiceIntro.subtitle": "Glas {name}.",
    "now.promptSubtitle": "Vidno v bližini.",
    "chats.empty": "Klepeti bodo tukaj.",
    "feed.previewSubtitle": "Polna: profil + klepet.",
    "voiceIntro.demoNote": "Demo način. Intro kasneje.",
    "ads.textPlaceholder": "O tebi in koga iščeš…",
    "rooms.placeInfo": "Sobe po lokaciji. Vstop le blizu.",
    "feed.answerPlaceholder": "Odgovor (do {max} znakov)",
  },

  cs: {
    "feed.adultModeHint": "18+ skryto. Zapni 18+ v profilu.",
    "voiceIntro.subtitle": "Hlas {name}.",
    "now.promptSubtitle": "Viditelné v okolí.",
    "chats.empty": "Chaty budou tady.",
    "feed.previewSubtitle": "Plná: profil + chat.",
    "voiceIntro.demoNote": "Demo režim. Intro později.",
    "ads.textPlaceholder": "O tobě a koho hledáš…",
    "rooms.placeInfo": "Místnosti podle polohy. Vstup jen poblíž.",
    "feed.answerPlaceholder": "Odpověď (do {max} znaků)",
  },

  sk: {
    "feed.adultModeHint": "18+ skryté. Zapni 18+ v profile.",
    "voiceIntro.subtitle": "Hlas {name}.",
    "now.promptSubtitle": "Viditeľné nablízku.",
    "chats.empty": "Chaty budú tu.",
    "feed.previewSubtitle": "Plná: profil + chat.",
    "voiceIntro.demoNote": "Demo režim. Intro neskôr.",
    "ads.textPlaceholder": "O tebe a koho hľadáš…",
    "rooms.placeInfo": "Miestnosti podľa polohy. Vstup len nablízku.",
    "feed.answerPlaceholder": "Odpoveď (do {max} znaků)",
  },

  da: {
    "feed.adultModeHint": "18+ skjult. Slå 18+ til i Profil.",
    "voiceIntro.subtitle": "Stemme {name}.",
    "now.promptSubtitle": "Synligt i nærheden.",
    "chats.empty": "Dine chats vises her.",
    "feed.previewSubtitle": "Fuld: profil + chat.",
    "voiceIntro.demoNote": "Demo. Optag intro senere.",
    "ads.textPlaceholder": "Om dig og hvem du søger…",
    "rooms.placeInfo": "Rum efter sted. Deltag kun i nærheden.",
    "feed.answerPlaceholder": "Svar (maks {max} tegn)",
  },

  de: {
    "feed.adultModeHint": "18+ verborgen. Aktiviere 18+ im Profil.",
    "voiceIntro.subtitle": "Stimme {name}.",
    "now.promptSubtitle": "Sichtbar in der Nähe.",
    "chats.empty": "Deine Chats erscheinen hier.",
    "feed.previewSubtitle": "Voll: Profil + Chat.",
    "voiceIntro.demoNote": "Demo. Intro später aufnehmen.",
    "ads.textPlaceholder": "Über dich und wen du suchst…",
    "rooms.placeInfo": "Räume nach Standort. Nur in der Nähe beitreten.",
    "feed.answerPlaceholder": "Antwort (max {max} Zeichen)",
  },

  el: {
    "feed.adultModeHint": "18+ κρυφό. Ενεργοποίησε 18+ στο Προφίλ.",
    "voiceIntro.subtitle": "Φωνή {name}.",
    "now.promptSubtitle": "Ορατό κοντά σου.",
    "chats.empty": "Τα chat σου θα είναι εδώ.",
    "feed.previewSubtitle": "Πλήρης: προφίλ + chat.",
    "voiceIntro.demoNote": "Demo. Ηχογράφησε intro αργότερα.",
    "ads.textPlaceholder": "Για σένα και τι ψάχνεις…",
    "rooms.placeInfo": "Δωμάτια βάσει θέσης. Μπες μόνο αν είσαι κοντά.",
    "feed.answerPlaceholder": "Απάντηση (έως {max})",
  },

  es: {
    "feed.adultModeHint": "18+ oculto. Activa 18+ en Perfil.",
    "voiceIntro.subtitle": "Voz de {name}.",
    "now.promptSubtitle": "Visible cerca de ti.",
    "chats.empty": "Tus chats aparecerán aquí.",
    "feed.previewSubtitle": "Completa: perfil + chat.",
    "voiceIntro.demoNote": "Modo demo. Graba intro después.",
    "ads.textPlaceholder": "Sobre ti y a quién buscas…",
    "rooms.placeInfo": "Salas por ubicación. Entra solo si estás cerca.",
    "feed.answerPlaceholder": "Respuesta (máx. {max})",
  },

  fi: {
    "feed.adultModeHint": "18+ piilossa. Ota 18+ käyttöön profiilissa.",
    "voiceIntro.subtitle": "{name}:n ääni.",
    "now.promptSubtitle": "Näkyy lähellä.",
    "chats.empty": "Chatit näkyvät täällä.",
    "feed.previewSubtitle": "Täysi: profiili + chat.",
    "voiceIntro.demoNote": "Demo. Nauhoita intro myöhemmin.",
    "ads.textPlaceholder": "Sinusta ja ketä etsit…",
    "rooms.placeInfo": "Huoneet sijainnin mukaan. Liity vain lähellä.",
    "feed.answerPlaceholder": "Vastaus (max {max})",
  },

  fr: {
    "feed.adultModeHint": "18+ masqué. Active 18+ dans Profil.",
    "voiceIntro.subtitle": "Voix de {name}.",
    "now.promptSubtitle": "Visible à proximité.",
    "chats.empty": "Tes chats apparaîtront ici.",
    "feed.previewSubtitle": "Complet : profil + chat.",
    "voiceIntro.demoNote": "Démo. Enregistre l’intro plus tard.",
    "ads.textPlaceholder": "Sur toi et qui tu cherches…",
    "rooms.placeInfo": "Salles par lieu. Rejoins seulement près de toi.",
    "feed.answerPlaceholder": "Réponse (max {max})",
  },

  hu: {
    "feed.adultModeHint": "18+ rejtve. Kapcsold be a Profilban.",
    "voiceIntro.subtitle": "{name} hangja.",
    "now.promptSubtitle": "A közelben látható.",
    "chats.empty": "A chatjeid itt lesznek.",
    "feed.previewSubtitle": "Teljes: profil + chat.",
    "voiceIntro.demoNote": "Demo. Intró később.",
    "ads.textPlaceholder": "Rólad és kit keresel…",
    "rooms.placeInfo": "Szobák hely alapján. Csak közelben csatlakozz.",
    "feed.answerPlaceholder": "Válasz (max {max})",
  },

  it: {
    "feed.adultModeHint": "18+ nascosto. Attiva 18+ nel Profilo.",
    "voiceIntro.subtitle": "Voce di {name}.",
    "now.promptSubtitle": "Visibile vicino a te.",
    "chats.empty": "Le chat appariranno qui.",
    "feed.previewSubtitle": "Completa: profilo + chat.",
    "voiceIntro.demoNote": "Demo. Registra l’intro dopo.",
    "ads.textPlaceholder": "Su di te e chi cerchi…",
    "rooms.placeInfo": "Stanze per posizione. Entra solo se sei vicino.",
    "feed.answerPlaceholder": "Risposta (max {max})",
  },

  nl: {
    "feed.adultModeHint": "18+ verborgen. Zet 18+ aan in Profiel.",
    "voiceIntro.subtitle": "Stem {name}.",
    "now.promptSubtitle": "Zichtbaar dichtbij.",
    "chats.empty": "Je chats verschijnen hier.",
    "feed.previewSubtitle": "Volledig: profiel + chat.",
    "voiceIntro.demoNote": "Demo. Neem intro later op.",
    "ads.textPlaceholder": "Over jou en wie je zoekt…",
    "rooms.placeInfo": "Ruimtes op locatie. Alleen meedoen als je dichtbij bent.",
    "feed.answerPlaceholder": "Antwoord (max {max})",
  },

  no: {
    "feed.adultModeHint": "18+ skjult. Aktiver 18+ i Profil.",
    "voiceIntro.subtitle": "Stemmen {name}.",
    "now.promptSubtitle": "Synlig i nærheten.",
    "chats.empty": "Chattene dine vises her.",
    "feed.previewSubtitle": "Full: profil + chat.",
    "voiceIntro.demoNote": "Demo. Spill inn intro senere.",
    "ads.textPlaceholder": "Om deg og hvem du søker…",
    "rooms.placeInfo": "Rom etter sted. Bli med bare i nærheten.",
    "feed.answerPlaceholder": "Svar (maks {max})",
  },

  pl: {
    "feed.adultModeHint": "18+ ukryte. Włącz 18+ w Profilu.",
    "voiceIntro.subtitle": "Głos {name}.",
    "now.promptSubtitle": "Widoczne w pobliżu.",
    "chats.empty": "Czaty pojawią się tutaj.",
    "feed.previewSubtitle": "Pełna: profil + czat.",
    "voiceIntro.demoNote": "Tryb demo. Intro później.",
    "ads.textPlaceholder": "O sobie i kogo szukasz…",
    "rooms.placeInfo": "Pokoje wg lokalizacji. Wejście tylko blisko.",
    "feed.answerPlaceholder": "Odpowiedź (max {max})",
  },

  pt: {
    "feed.adultModeHint": "18+ oculto. Ative 18+ no Perfil.",
    "voiceIntro.subtitle": "Voz de {name}.",
    "now.promptSubtitle": "Visível por perto.",
    "chats.empty": "Seus chats aparecem aqui.",
    "feed.previewSubtitle": "Completa: perfil + chat.",
    "voiceIntro.demoNote": "Demo. Grave o intro depois.",
    "ads.textPlaceholder": "Sobre você e quem procura…",
    "rooms.placeInfo": "Salas por local. Entre só se estiver perto.",
    "feed.answerPlaceholder": "Resposta (máx {max})",
  },

  ro: {
    "feed.adultModeHint": "18+ ascuns. Activează 18+ în Profil.",
    "voiceIntro.subtitle": "Vocea lui {name}.",
    "now.promptSubtitle": "Vizibil aproape.",
    "chats.empty": "Chat-urile tale apar aici.",
    "feed.previewSubtitle": "Complet: profil + chat.",
    "voiceIntro.demoNote": "Demo. Intro mai târziu.",
    "ads.textPlaceholder": "Despre tine și pe cine cauți…",
    "rooms.placeInfo": "Camere după locație. Intră doar dacă ești aproape.",
    "feed.answerPlaceholder": "Răspuns (max {max})",
  },

  sv: {
    "feed.adultModeHint": "18+ dolt. Aktivera 18+ i Profil.",
    "voiceIntro.subtitle": "Röst {name}.",
    "now.promptSubtitle": "Synligt i närheten.",
    "chats.empty": "Dina chattar visas här.",
    "feed.previewSubtitle": "Full: profil + chatt.",
    "voiceIntro.demoNote": "Demo. Spela in intro senare.",
    "ads.textPlaceholder": "Om dig och vem du söker…",
    "rooms.placeInfo": "Rum efter plats. Gå med bara i närheten.",
    "feed.answerPlaceholder": "Svar (max {max})",
  },

  tr: {
    "feed.adultModeHint": "18+ gizli. Profilden 18+ aç.",
    "voiceIntro.subtitle": "{name} sesi.",
    "now.promptSubtitle": "Yakında görünür.",
    "chats.empty": "Sohbetlerin burada olacak.",
    "feed.previewSubtitle": "Tam: profil + sohbet.",
    "voiceIntro.demoNote": "Demo. İntro’yu sonra kaydet.",
    "ads.textPlaceholder": "Senden ve kimi aradığından…",
    "rooms.placeInfo": "Odalar konuma göre. Yalnızca yakında katıl.",
    "feed.answerPlaceholder": "Yanıt (en çok {max})",
  },
};

function readJson(filePath: string): any {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath: string, obj: any) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function main() {
  const locales = Object.keys(updates);
  let changedFiles = 0;

  for (const locale of locales) {
    const filePath = path.join(baseDir, `${locale}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[skip] missing file: ${filePath}`);
      continue;
    }

    const json = readJson(filePath);
    const dict = updates[locale];
    let changed = 0;

    for (const [k, v] of Object.entries(dict)) {
      if (typeof json[k] === "string") {
        if (json[k] !== v) {
          json[k] = v;
          changed++;
        }
      } else {
        // ключа может не быть в конкретной локали — не создаём новый, только предупреждаем
        console.warn(`[warn] ${locale}: key not found (not changed): ${k}`);
      }
    }

    if (changed > 0) {
      writeJson(filePath, json);
      changedFiles++;
      console.log(`[ok] ${locale}.json updated: ${changed} keys`);
    } else {
      console.log(`[ok] ${locale}.json no changes`);
    }
  }

  console.log(`Done. Files changed: ${changedFiles}`);
}

main();
