#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DIR = path.join(process.cwd(), "src", "i18n", "locales");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8"); }

const PATCH = {
  en: {
    "common.sending": "Sending…",
    "common.failed": "Not sent",
  },

  ru: {
    "common.sending": "Отправка…",
    "common.failed": "Не отправлено",
  },

  uk: {
    "common.sending": "Надсилання…",
    "common.failed": "Не надіслано",
  },

  hr: {
    "common.sending": "Šaljem…",
    "common.failed": "Nije poslano",
  },

  de: {
    "common.sending": "Senden…",
    "common.failed": "Nicht gesendet",
  },

  fr: {
    "common.sending": "Envoi…",
    "common.failed": "Non envoyé",
  },

  es: {
    "common.sending": "Enviando…",
    "common.failed": "No enviado",
  },

  it: {
    "common.sending": "Invio…",
    "common.failed": "Non inviato",
  },

  pt: {
    "common.sending": "A enviar…",
    "common.failed": "Não enviado",
  },

  nl: {
    "common.sending": "Verzenden…",
    "common.failed": "Niet verzonden",
  },

  sv: {
    "common.sending": "Skickar…",
    "common.failed": "Inte skickat",
  },

  no: {
    "common.sending": "Sender…",
    "common.failed": "Ikke sendt",
  },

  da: {
    "common.sending": "Sender…",
    "common.failed": "Ikke sendt",
  },

  fi: {
    "common.sending": "Lähetetään…",
    "common.failed": "Ei lähetetty",
  },

  cs: {
    "common.sending": "Odesílám…",
    "common.failed": "Neodesláno",
  },

  sk: {
    "common.sending": "Odosielam…",
    "common.failed": "Neodoslané",
  },

  sl: {
    "common.sending": "Pošiljam…",
    "common.failed": "Ni poslano",
  },

  sr: {
    "common.sending": "Šaljem…",
    "common.failed": "Nije poslato",
  },

  bs: {
    "common.sending": "Šaljem…",
    "common.failed": "Nije poslano",
  },

  ro: {
    "common.sending": "Se trimite…",
    "common.failed": "Netrimis",
  },

  hu: {
    "common.sending": "Küldés…",
    "common.failed": "Nincs elküldve",
  },

  el: {
    "common.sending": "Αποστολή…",
    "common.failed": "Δεν στάλθηκε",
  },

  tr: {
    "common.sending": "Gönderiliyor…",
    "common.failed": "Gönderilemedi",
  },
};

// Эти 12 ключей сейчас отсутствуют во многих локалях => показывается английский.
// Добавляем и переводим.
const ROOMS_GEO_KEYS = {
  bs: {
    "rooms.range.title": "Udaljenost uparivanja",
    "rooms.range.hint": "Šire = više ljudi, manje precizno. Usko = manje ljudi, bliže.",
    "rooms.range.note": "Ovo mijenja ko završava u istom chatu sobe. Ne mijenja skalu mape.",
    "rooms.range.wide": "Široko",
    "rooms.range.normal": "Normalno",
    "rooms.range.tight": "Usko",
    "geo.permissionTitle": "Lokacija",
    "geo.permissionBlocked": "Pristup lokaciji je blokiran u postavkama.",
    "geo.permissionBlockedHelp": "Uključite lokaciju u postavkama uređaja, zatim se vratite u aplikaciju.",
    "geo.openSettings": "Otvori postavke",
    "geo.timeout": "Lokacija traje predugo. Dodirnite osvježi i pokušajte ponovo.",
    "rooms.chatUnavailable": "Chat je privremeno nedostupan (provjerite Firestore pravila / vezu).",
  },
  cs: {
    "rooms.range.title": "Vzdálenost párování",
    "rooms.range.hint": "Širší = více lidí, méně přesné. Těsné = méně lidí, blíž.",
    "rooms.range.note": "Tímto měníte, kdo skončí ve stejném chatu místnosti. Nemění to měřítko mapy.",
    "rooms.range.wide": "Široké",
    "rooms.range.normal": "Normální",
    "rooms.range.tight": "Těsné",
    "geo.permissionTitle": "Poloha",
    "geo.permissionBlocked": "Přístup k poloze je v nastavení zablokován.",
    "geo.permissionBlockedHelp": "Povolte polohu v nastavení zařízení a vraťte se do aplikace.",
    "geo.openSettings": "Otevřít nastavení",
    "geo.timeout": "Získání polohy trvá příliš dlouho. Klepněte na obnovit a zkuste to znovu.",
    "rooms.chatUnavailable": "Chat je dočasně nedostupný (zkontrolujte pravidla Firestore / připojení).",
  },
  da: {
    "rooms.range.title": "Match-afstand",
    "rooms.range.hint": "Bred = flere personer, mindre præcist. Snæver = færre personer, tættere på.",
    "rooms.range.note": "Dette ændrer, hvem der ender i samme rumchat. Det ændrer ikke kortets skala.",
    "rooms.range.wide": "Bred",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Snæver",
    "geo.permissionTitle": "Placering",
    "geo.permissionBlocked": "Adgang til placering er blokeret i indstillingerne.",
    "geo.permissionBlockedHelp": "Aktivér placering i enhedens indstillinger og gå tilbage til appen.",
    "geo.openSettings": "Åbn indstillinger",
    "geo.timeout": "Placering tager for lang tid. Tryk opdater og prøv igen.",
    "rooms.chatUnavailable": "Chat er midlertidigt utilgængelig (tjek Firestore-regler / forbindelse).",
  },
  de: {
    "rooms.range.title": "Match-Distanz",
    "rooms.range.hint": "Weit = mehr Leute, weniger präzise. Eng = weniger Leute, näher.",
    "rooms.range.note": "Das ändert, wer im selben Raum-Chat landet. Die Kartenskala bleibt gleich.",
    "rooms.range.wide": "Weit",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Eng",
    "geo.permissionTitle": "Standort",
    "geo.permissionBlocked": "Standortzugriff ist in den Einstellungen blockiert.",
    "geo.permissionBlockedHelp": "Aktiviere den Standort in den Geräteeinstellungen und kehre dann zur App zurück.",
    "geo.openSettings": "Einstellungen öffnen",
    "geo.timeout": "Standort dauert zu lange. Tippe auf Aktualisieren und versuche es erneut.",
    "rooms.chatUnavailable": "Chat ist vorübergehend nicht verfügbar (Firestore-Regeln / Verbindung prüfen).",
  },
  el: {
    "rooms.range.title": "Απόσταση αντιστοίχισης",
    "rooms.range.hint": "Ευρύ = περισσότερα άτομα, λιγότερο ακριβές. Στενό = λιγότερα άτομα, πιο κοντά.",
    "rooms.range.note": "Αυτό αλλάζει ποιοι καταλήγουν στο ίδιο chat δωματίου. Δεν αλλάζει την κλίμακα του χάρτη.",
    "rooms.range.wide": "Ευρύ",
    "rooms.range.normal": "Κανονικό",
    "rooms.range.tight": "Στενό",
    "geo.permissionTitle": "Τοποθεσία",
    "geo.permissionBlocked": "Η πρόσβαση στην τοποθεσία είναι μπλοκαρισμένη στις ρυθμίσεις.",
    "geo.permissionBlockedHelp": "Ενεργοποιήστε την τοποθεσία στις ρυθμίσεις της συσκευής και επιστρέψτε στην εφαρμογή.",
    "geo.openSettings": "Άνοιγμα ρυθμίσεων",
    "geo.timeout": "Η τοποθεσία αργεί πολύ. Πατήστε ανανέωση και δοκιμάστε ξανά.",
    "rooms.chatUnavailable": "Το chat δεν είναι προσωρινά διαθέσιμο (ελέγξτε κανόνες Firestore / σύνδεση).",
  },
  es: {
    "rooms.range.title": "Distancia de coincidencia",
    "rooms.range.hint": "Amplio = más gente, menos preciso. Estrecho = menos gente, más cerca.",
    "rooms.range.note": "Esto cambia quién termina en el mismo chat de sala. No cambia la escala del mapa.",
    "rooms.range.wide": "Amplio",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Estrecho",
    "geo.permissionTitle": "Ubicación",
    "geo.permissionBlocked": "El acceso a la ubicación está bloqueado en los ajustes.",
    "geo.permissionBlockedHelp": "Activa la ubicación en los ajustes del dispositivo y vuelve a la app.",
    "geo.openSettings": "Abrir ajustes",
    "geo.timeout": "La ubicación tarda demasiado. Toca actualizar y prueba de nuevo.",
    "rooms.chatUnavailable": "El chat no está disponible temporalmente (revisa reglas de Firestore / conexión).",
  },
  fi: {
    "rooms.range.title": "Yhdistämisetäisyys",
    "rooms.range.hint": "Laaja = enemmän ihmisiä, vähemmän tarkka. Tiukka = vähemmän ihmisiä, lähempänä.",
    "rooms.range.note": "Tämä muuttaa, ketkä päätyvät samaan huonechattiin. Se ei muuta kartan mittakaavaa.",
    "rooms.range.wide": "Laaja",
    "rooms.range.normal": "Normaali",
    "rooms.range.tight": "Tiukka",
    "geo.permissionTitle": "Sijainti",
    "geo.permissionBlocked": "Sijainnin käyttö on estetty asetuksissa.",
    "geo.permissionBlockedHelp": "Ota sijainti käyttöön laitteen asetuksista ja palaa sovellukseen.",
    "geo.openSettings": "Avaa asetukset",
    "geo.timeout": "Sijainnin haku kestää liian kauan. Napauta päivitystä ja yritä uudelleen.",
    "rooms.chatUnavailable": "Chat ei ole tilapäisesti käytettävissä (tarkista Firestore-säännöt / yhteys).",
  },
  fr: {
    "rooms.range.title": "Distance de matching",
    "rooms.range.hint": "Large = plus de monde, moins précis. Serré = moins de monde, plus proche.",
    "rooms.range.note": "Cela change qui se retrouve dans le même chat de salle. Ça ne change pas l’échelle de la carte.",
    "rooms.range.wide": "Large",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Serré",
    "geo.permissionTitle": "Localisation",
    "geo.permissionBlocked": "L’accès à la localisation est bloqué dans les réglages.",
    "geo.permissionBlockedHelp": "Activez la localisation dans les réglages de l’appareil, puis revenez dans l’app.",
    "geo.openSettings": "Ouvrir les réglages",
    "geo.timeout": "La localisation prend trop de temps. Appuyez sur actualiser et réessayez.",
    "rooms.chatUnavailable": "Le chat est temporairement indisponible (vérifiez règles Firestore / connexion).",
  },
  hr: {
    "rooms.range.title": "Udaljenost uparivanja",
    "rooms.range.hint": "Šire = više ljudi, manje precizno. Usko = manje ljudi, bliže.",
    "rooms.range.note": "Ovo mijenja tko završi u istom chatu sobe. Ne mijenja mjerilo karte.",
    "rooms.range.wide": "Široko",
    "rooms.range.normal": "Normalno",
    "rooms.range.tight": "Usko",
    "geo.permissionTitle": "Lokacija",
    "geo.permissionBlocked": "Pristup lokaciji je blokiran u postavkama.",
    "geo.permissionBlockedHelp": "Uključite lokaciju u postavkama uređaja, zatim se vratite u aplikaciju.",
    "geo.openSettings": "Otvori postavke",
    "geo.timeout": "Lokacija traje predugo. Dodirnite osvježi i pokušajte ponovno.",
    "rooms.chatUnavailable": "Chat je privremeno nedostupan (provjerite Firestore pravila / vezu).",
  },
  hu: {
    "rooms.range.title": "Párosítási távolság",
    "rooms.range.hint": "Tág = több ember, kevésbé pontos. Szoros = kevesebb ember, közelebb.",
    "rooms.range.note": "Ez megváltoztatja, kik kerülnek ugyanabba a szoba chatbe. A térkép méretarányát nem változtatja.",
    "rooms.range.wide": "Tág",
    "rooms.range.normal": "Normál",
    "rooms.range.tight": "Szoros",
    "geo.permissionTitle": "Helymeghatározás",
    "geo.permissionBlocked": "A helyhozzáférés le van tiltva a beállításokban.",
    "geo.permissionBlockedHelp": "Engedélyezze a helyet az eszköz beállításaiban, majd térjen vissza az apphoz.",
    "geo.openSettings": "Beállítások megnyitása",
    "geo.timeout": "A helymeghatározás túl sokáig tart. Nyomjon frissítést és próbálja újra.",
    "rooms.chatUnavailable": "A chat átmenetileg nem elérhető (ellenőrizze a Firestore szabályokat / kapcsolatot).",
  },
  it: {
    "rooms.range.title": "Distanza di abbinamento",
    "rooms.range.hint": "Ampio = più persone, meno preciso. Stretto = meno persone, più vicino.",
    "rooms.range.note": "Questo cambia chi finisce nello stesso chat della stanza. Non cambia la scala della mappa.",
    "rooms.range.wide": "Ampio",
    "rooms.range.normal": "Normale",
    "rooms.range.tight": "Stretto",
    "geo.permissionTitle": "Posizione",
    "geo.permissionBlocked": "L’accesso alla posizione è bloccato nelle impostazioni.",
    "geo.permissionBlockedHelp": "Abilita la posizione nelle impostazioni del dispositivo, poi torna nell’app.",
    "geo.openSettings": "Apri impostazioni",
    "geo.timeout": "La posizione sta impiegando troppo tempo. Tocca aggiorna e riprova.",
    "rooms.chatUnavailable": "La chat non è disponibile temporaneamente (controlla regole Firestore / connessione).",
  },
  nl: {
    "rooms.range.title": "Matchafstand",
    "rooms.range.hint": "Ruim = meer mensen, minder precies. Nauw = minder mensen, dichterbij.",
    "rooms.range.note": "Dit bepaalt wie in dezelfde kamerchat terechtkomt. Het verandert de kaartschaal niet.",
    "rooms.range.wide": "Ruim",
    "rooms.range.normal": "Normaal",
    "rooms.range.tight": "Nauw",
    "geo.permissionTitle": "Locatie",
    "geo.permissionBlocked": "Toegang tot locatie is geblokkeerd in de instellingen.",
    "geo.permissionBlockedHelp": "Schakel locatie in bij de apparaatinstellingen en ga daarna terug naar de app.",
    "geo.openSettings": "Instellingen openen",
    "geo.timeout": "Locatie duurt te lang. Tik op vernieuwen en probeer opnieuw.",
    "rooms.chatUnavailable": "Chat is tijdelijk niet beschikbaar (controleer Firestore-regels / verbinding).",
  },
  no: {
    "rooms.range.title": "Match-avstand",
    "rooms.range.hint": "Bred = flere personer, mindre presist. Smal = færre personer, nærmere.",
    "rooms.range.note": "Dette endrer hvem som havner i samme romchat. Det endrer ikke kartskalaen.",
    "rooms.range.wide": "Bred",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Smal",
    "geo.permissionTitle": "Plassering",
    "geo.permissionBlocked": "Tilgang til posisjon er blokkert i innstillingene.",
    "geo.permissionBlockedHelp": "Aktiver posisjon i enhetsinnstillingene, og gå tilbake til appen.",
    "geo.openSettings": "Åpne innstillinger",
    "geo.timeout": "Posisjon tar for lang tid. Trykk oppdater og prøv igjen.",
    "rooms.chatUnavailable": "Chat er midlertidig utilgjengelig (sjekk Firestore-regler / tilkobling).",
  },
  pl: {
    "rooms.range.title": "Dystans dopasowania",
    "rooms.range.hint": "Szeroko = więcej osób, mniej precyzyjnie. Wąsko = mniej osób, bliżej.",
    "rooms.range.note": "To zmienia, kto trafi do tego samego czatu pokoju. Nie zmienia skali mapy.",
    "rooms.range.wide": "Szeroko",
    "rooms.range.normal": "Normalnie",
    "rooms.range.tight": "Wąsko",
    "geo.permissionTitle": "Lokalizacja",
    "geo.permissionBlocked": "Dostęp do lokalizacji jest zablokowany w ustawieniach.",
    "geo.permissionBlockedHelp": "Włącz lokalizację w ustawieniach urządzenia, a potem wróć do aplikacji.",
    "geo.openSettings": "Otwórz ustawienia",
    "geo.timeout": "Uzyskanie lokalizacji trwa za długo. Naciśnij odśwież i spróbuj ponownie.",
    "rooms.chatUnavailable": "Czat jest tymczasowo niedostępny (sprawdź reguły Firestore / połączenie).",
  },
  pt: {
    "rooms.range.title": "Distância de correspondência",
    "rooms.range.hint": "Amplo = mais pessoas, menos preciso. Apertado = menos pessoas, mais perto.",
    "rooms.range.note": "Isto altera quem cai no mesmo chat da sala. Não altera a escala do mapa.",
    "rooms.range.wide": "Amplo",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Apertado",
    "geo.permissionTitle": "Localização",
    "geo.permissionBlocked": "O acesso à localização está bloqueado nas definições.",
    "geo.permissionBlockedHelp": "Ative a localização nas definições do dispositivo e volte à aplicação.",
    "geo.openSettings": "Abrir definições",
    "geo.timeout": "A localização está a demorar demasiado. Toque em atualizar e tente novamente.",
    "rooms.chatUnavailable": "O chat está temporariamente indisponível (verifique regras do Firestore / ligação).",
  },
  ro: {
    "rooms.range.title": "Distanța de potrivire",
    "rooms.range.hint": "Larg = mai multe persoane, mai puțin precis. Îngust = mai puține persoane, mai aproape.",
    "rooms.range.note": "Asta schimbă cine ajunge în același chat de cameră. Nu schimbă scara hărții.",
    "rooms.range.wide": "Larg",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Îngust",
    "geo.permissionTitle": "Locație",
    "geo.permissionBlocked": "Accesul la locație este blocat în setări.",
    "geo.permissionBlockedHelp": "Activați locația în setările dispozitivului, apoi reveniți în aplicație.",
    "geo.openSettings": "Deschide setările",
    "geo.timeout": "Localizarea durează prea mult. Apăsați reîmprospătează și încercați din nou.",
    "rooms.chatUnavailable": "Chatul este temporar indisponibil (verificați regulile Firestore / conexiunea).",
  },
  ru: {
    "rooms.range.title": "Дистанция совпадения",
    "rooms.range.hint": "Шире = больше людей, менее точно. Уже = меньше людей, ближе.",
    "rooms.range.note": "Это влияет на то, кто попадёт в один чат комнаты. Масштаб карты не меняется.",
    "rooms.range.wide": "Широко",
    "rooms.range.normal": "Нормально",
    "rooms.range.tight": "Узко",
    "geo.permissionTitle": "Геолокация",
    "geo.permissionBlocked": "Доступ к геолокации заблокирован в настройках.",
    "geo.permissionBlockedHelp": "Включите геолокацию в настройках устройства и вернитесь в приложение.",
    "geo.openSettings": "Открыть настройки",
    "geo.timeout": "Геолокация слишком долго определяется. Нажмите обновить и попробуйте ещё раз.",
    "rooms.chatUnavailable": "Чат временно недоступен (проверьте правила Firestore / соединение).",
  },
  sk: {
    "rooms.range.title": "Vzdialenosť párovania",
    "rooms.range.hint": "Široko = viac ľudí, menej presné. Tesne = menej ľudí, bližšie.",
    "rooms.range.note": "Toto mení, kto skončí v rovnakom chate miestnosti. Nemení to mierku mapy.",
    "rooms.range.wide": "Široko",
    "rooms.range.normal": "Normálne",
    "rooms.range.tight": "Tesne",
    "geo.permissionTitle": "Poloha",
    "geo.permissionBlocked": "Prístup k polohe je v nastaveniach zablokovaný.",
    "geo.permissionBlockedHelp": "Povoľte polohu v nastaveniach zariadenia a vráťte sa do aplikácie.",
    "geo.openSettings": "Otvoriť nastavenia",
    "geo.timeout": "Získanie polohy trvá príliš dlho. Ťuknite na obnoviť a skúste znova.",
    "rooms.chatUnavailable": "Chat je dočasne nedostupný (skontrolujte pravidlá Firestore / pripojenie).",
  },
  sl: {
    "rooms.range.title": "Razdalja ujemanja",
    "rooms.range.hint": "Široko = več ljudi, manj natančno. Ozko = manj ljudi, bližje.",
    "rooms.range.note": "To spremeni, kdo konča v istem klepetu sobe. Ne spremeni merila zemljevida.",
    "rooms.range.wide": "Široko",
    "rooms.range.normal": "Normalno",
    "rooms.range.tight": "Ozko",
    "geo.permissionTitle": "Lokacija",
    "geo.permissionBlocked": "Dostop do lokacije je v nastavitvah blokiran.",
    "geo.permissionBlockedHelp": "Omogočite lokacijo v nastavitvah naprave in se vrnite v aplikacijo.",
    "geo.openSettings": "Odpri nastavitve",
    "geo.timeout": "Pridobivanje lokacije traja predolgo. Tapnite osveži in poskusite znova.",
    "rooms.chatUnavailable": "Klepet je začasno nedosegljiv (preverite pravila Firestore / povezavo).",
  },
  sr: {
    "rooms.range.title": "Udaljenost uparivanja",
    "rooms.range.hint": "Šire = više ljudi, manje precizno. Usko = manje ljudi, bliže.",
    "rooms.range.note": "Ovo menja ko završi u istom četu sobe. Ne menja razmeru mape.",
    "rooms.range.wide": "Široko",
    "rooms.range.normal": "Normalno",
    "rooms.range.tight": "Usko",
    "geo.permissionTitle": "Lokacija",
    "geo.permissionBlocked": "Pristup lokaciji je blokiran u podešavanjima.",
    "geo.permissionBlockedHelp": "Uključite lokaciju u podešavanjima uređaja, pa se vratite u aplikaciju.",
    "geo.openSettings": "Otvori podešavanja",
    "geo.timeout": "Lokacija traje predugo. Tapnite osveži i pokušajte ponovo.",
    "rooms.chatUnavailable": "Čet je privremeno nedostupan (proverite Firestore pravila / vezu).",
  },
  sv: {
    "rooms.range.title": "Matchningsavstånd",
    "rooms.range.hint": "Brett = fler personer, mindre exakt. Snävt = färre personer, närmare.",
    "rooms.range.note": "Detta ändrar vilka som hamnar i samma rumchatt. Det ändrar inte kartans skala.",
    "rooms.range.wide": "Brett",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Snävt",
    "geo.permissionTitle": "Plats",
    "geo.permissionBlocked": "Åtkomst till plats är blockerad i inställningarna.",
    "geo.permissionBlockedHelp": "Aktivera plats i enhetens inställningar och gå tillbaka till appen.",
    "geo.openSettings": "Öppna inställningar",
    "geo.timeout": "Platsen tar för lång tid. Tryck uppdatera och försök igen.",
    "rooms.chatUnavailable": "Chatten är tillfälligt otillgänglig (kontrollera Firestore-regler / anslutning).",
  },
  tr: {
    "rooms.range.title": "Eşleşme mesafesi",
    "rooms.range.hint": "Geniş = daha çok kişi, daha az hassas. Dar = daha az kişi, daha yakın.",
    "rooms.range.note": "Bu, aynı oda sohbetine kimlerin düşeceğini değiştirir. Harita ölçeğini değiştirmez.",
    "rooms.range.wide": "Geniş",
    "rooms.range.normal": "Normal",
    "rooms.range.tight": "Dar",
    "geo.permissionTitle": "Konum",
    "geo.permissionBlocked": "Konum erişimi ayarlarda engellendi.",
    "geo.permissionBlockedHelp": "Cihaz ayarlarından konumu açın, sonra uygulamaya geri dönün.",
    "geo.openSettings": "Ayarları aç",
    "geo.timeout": "Konum çok uzun sürüyor. Yenile’ye dokunup tekrar deneyin.",
    "rooms.chatUnavailable": "Sohbet geçici olarak kullanılamıyor (Firestore kuralları / bağlantıyı kontrol edin).",
  },
  uk: {
    "rooms.range.title": "Дистанція збігу",
    "rooms.range.hint": "Ширше = більше людей, менш точно. Вужче = менше людей, ближче.",
    "rooms.range.note": "Це впливає на те, хто потрапить в один чат кімнати. Масштаб мапи не змінюється.",
    "rooms.range.wide": "Широко",
    "rooms.range.normal": "Нормально",
    "rooms.range.tight": "Вузько",
    "geo.permissionTitle": "Геолокація",
    "geo.permissionBlocked": "Доступ до геолокації заблоковано в налаштуваннях.",
    "geo.permissionBlockedHelp": "Увімкніть геолокацію в налаштуваннях пристрою та поверніться в застосунок.",
    "geo.openSettings": "Відкрити налаштування",
    "geo.timeout": "Геолокація визначається надто довго. Натисніть оновити й спробуйте ще раз.",
    "rooms.chatUnavailable": "Чат тимчасово недоступний (перевірте правила Firestore / з’єднання).",
  },
};

function apply(locale, patch) {
  const file = path.join(DIR, `${locale}.json`);
  if (!fs.existsSync(file)) return;
  const json = readJson(file);
  let changed = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (json[k] !== v) {
      json[k] = v;
      changed++;
    }
  }
  if (changed > 0) {
    writeJson(file, json);
    console.log(`[${locale}] patched: ${changed}`);
  } else {
    console.log(`[${locale}] ok (no changes)`);
  }
}

for (const [loc, patch] of Object.entries(PATCH)) apply(loc, patch);

// применяем rooms/geo патчи
for (const [loc, patch] of Object.entries(ROOMS_GEO_KEYS)) apply(loc, patch);

console.log("Done.");
