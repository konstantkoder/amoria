import type { Locale } from "@/i18n/translations";
import type {
  StorySparksArtifactDto,
  StorySparksArtifactRoundDto,
  StorySparksCardDto,
  StorySparksChoicePayload,
  StorySparksPackDto,
  StorySparksRoundId,
  StorySparksTranslation,
  TogetherEventDto,
} from "@/services/api/types";

export const STORY_SPARKS_ROUND_IDS: StorySparksRoundId[] = [
  "place",
  "detail",
  "twist",
  "ending",
];

export type StorySparksChoice = StorySparksChoicePayload & {
  fromUserId: string;
  card: StorySparksCardDto;
  createdAt: string;
  eventId: string;
};

export function localizeStoryText(
  value: StorySparksTranslation | undefined,
  locale: Locale
): string {
  if (!value) return "";
  const language = locale === "ru" || locale === "hr" ? locale : "en";
  return value[language]?.trim() || value.en?.trim() || value.ru?.trim() || value.hr?.trim() || "";
}

export function validateStoryPack(pack: StorySparksPackDto | undefined | null): boolean {
  if (!pack?.packId || !Array.isArray(pack.rounds) || pack.rounds.length !== 4) {
    return false;
  }

  return STORY_SPARKS_ROUND_IDS.every((roundId, index) => {
    const round = pack.rounds[index];
    return (
      round?.id === roundId &&
      Array.isArray(round.cards) &&
      round.cards.length === 3 &&
      round.cards.every((card) => card.round === roundId && Boolean(card.id))
    );
  });
}

export function readStoryChoicePayload(payload: unknown): StorySparksChoicePayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Partial<Record<keyof StorySparksChoicePayload, unknown>>;
  const roundId = String(value.roundId ?? "").trim() as StorySparksRoundId;
  const cardId = String(value.cardId ?? "").trim();
  const packId = String(value.packId ?? "").trim();
  const clientRoundIndex = Number(value.clientRoundIndex);
  if (!STORY_SPARKS_ROUND_IDS.includes(roundId) || !cardId || !packId) return null;
  if (!Number.isInteger(clientRoundIndex) || clientRoundIndex < 0) return null;

  return {
    roundId,
    cardId,
    packId,
    clientRoundIndex,
  };
}

export function buildStoryChoicesFromEvents(
  events: TogetherEventDto[],
  pack: StorySparksPackDto
): StorySparksChoice[] {
  const cardsById = new Map<string, StorySparksCardDto>();
  for (const round of pack.rounds) {
    for (const card of round.cards) {
      cardsById.set(card.id, card);
    }
  }

  const byUserRound = new Map<string, StorySparksChoice>();
  for (const event of events) {
    if (event.type !== "story_choice") continue;
    const fromUserId = String(event.fromUserId ?? "").trim();
    if (!fromUserId) continue;
    const payload = readStoryChoicePayload(event.payload);
    if (!payload || payload.packId !== pack.packId) continue;
    const card = cardsById.get(payload.cardId);
    if (!card || card.round !== payload.roundId) continue;

    const key = `${fromUserId}:${payload.roundId}`;
    if (byUserRound.has(key)) continue;
    byUserRound.set(key, {
      ...payload,
      fromUserId,
      card,
      createdAt: String(event.createdAt ?? ""),
      eventId: String(event.id || event.clientEventId || key),
    });
  }

  return Array.from(byUserRound.values()).sort((left, right) => {
    const byRound =
      STORY_SPARKS_ROUND_IDS.indexOf(left.roundId) -
      STORY_SPARKS_ROUND_IDS.indexOf(right.roundId);
    if (byRound !== 0) return byRound;
    const byCreated = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (Number.isFinite(byCreated) && byCreated !== 0) return byCreated;
    return left.fromUserId.localeCompare(right.fromUserId);
  });
}

export function getChoiceForUserRound(
  choices: StorySparksChoice[],
  userId: string,
  roundId: StorySparksRoundId
): StorySparksChoice | null {
  return (
    choices.find(
      (choice) => choice.fromUserId === userId && choice.roundId === roundId
    ) ?? null
  );
}

export function getRoundChoices(
  choices: StorySparksChoice[],
  roundId: StorySparksRoundId
): StorySparksChoice[] {
  return choices.filter((choice) => choice.roundId === roundId);
}

export function buildStoryArtifactFromEvents(
  events: TogetherEventDto[],
  pack: StorySparksPackDto
): StorySparksArtifactDto | null {
  const choices = buildStoryChoicesFromEvents(events, pack);
  if (!choices.length) return null;

  const rounds: StorySparksArtifactRoundDto[] = pack.rounds.map((round) => ({
    roundId: round.id,
    title: round.title,
    choices: getRoundChoices(choices, round.id).map((choice) => ({
      roundId: choice.roundId,
      cardId: choice.cardId,
      packId: choice.packId,
      clientRoundIndex: choice.clientRoundIndex,
      fromUserId: choice.fromUserId,
      card: choice.card,
      createdAt: choice.createdAt,
    })),
  }));

  return {
    packId: pack.packId,
    version: pack.version,
    title: buildTitle(rounds),
    summary: buildSummary(rounds),
    rounds,
  };
}

export function storyArtifactToDmSummary(
  artifact: StorySparksArtifactDto | null,
  locale: Locale
) {
  if (!artifact) return undefined;
  return {
    storyTitle: localizeStoryText(artifact.title, locale),
    summary: localizeStoryText(artifact.summary, locale),
    selectedCards: artifact.rounds.map((round) => ({
      roundId: round.roundId,
      title: localizeStoryText(round.title, locale),
      choices: round.choices.map((choice) => ({
        fromUserId: choice.fromUserId,
        title: localizeStoryText(choice.card.title, locale),
        emoji: choice.card.emoji,
      })),
    })),
  };
}

function buildTitle(rounds: StorySparksArtifactRoundDto[]): StorySparksTranslation {
  const place = rounds.find((round) => round.roundId === "place")?.choices[0]?.card.title;
  return {
    ru: place?.ru ? `История: ${place.ru}` : "История на двоих",
    en: place?.en ? `Story: ${place.en}` : "Story Sparks",
    hr: place?.hr ? `Priča: ${place.hr}` : "Iskre priče",
  };
}

function buildSummary(rounds: StorySparksArtifactRoundDto[]): StorySparksTranslation {
  return {
    ru: `Место: ${roundChoiceList(rounds, "place", "ru")}. Деталь: ${roundChoiceList(rounds, "detail", "ru")}. Поворот: ${roundChoiceList(rounds, "twist", "ru")}. Финал: ${roundChoiceList(rounds, "ending", "ru")}.`,
    en: `Place: ${roundChoiceList(rounds, "place", "en")}. Detail: ${roundChoiceList(rounds, "detail", "en")}. Twist: ${roundChoiceList(rounds, "twist", "en")}. Ending: ${roundChoiceList(rounds, "ending", "en")}.`,
    hr: `Mjesto: ${roundChoiceList(rounds, "place", "hr")}. Detalj: ${roundChoiceList(rounds, "detail", "hr")}. Preokret: ${roundChoiceList(rounds, "twist", "hr")}. Završetak: ${roundChoiceList(rounds, "ending", "hr")}.`,
  };
}

function roundChoiceList(
  rounds: StorySparksArtifactRoundDto[],
  roundId: StorySparksRoundId,
  language: "ru" | "en" | "hr"
): string {
  const titles = [
    ...new Set(
      rounds
        .find((round) => round.roundId === roundId)
        ?.choices.map((choice) => choice.card.title[language]) ?? []
    ),
  ];
  if (titles.length === 0) {
    return language === "ru" ? "ещё не выбрано" : language === "hr" ? "još nije odabrano" : "not chosen yet";
  }
  return titles.join(" + ");
}
