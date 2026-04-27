import { getRuntimeLocale, translate } from "@/i18n/translations";
import type { DrawExampleVisualId } from "@/assets/play/drawExamples";

export type PlayDrawChallenge = {
  id: string;
  text: string;
  exampleVisuals?: DrawExampleVisualId[];
};

type PlayDrawChallengeDefinition = {
  id: string;
  textKey: string;
  en: string;
  ru: string;
  exampleVisuals?: readonly DrawExampleVisualId[];
};

const DRAW_CHALLENGE_DEFS = [
  {
    id: "rain_hideout",
    textKey: "play.challenge.draw.rainHideout",
    en: "Draw a place where you would want to hide from the rain.",
    ru: "Нарисуйте место, где хотелось бы спрятаться от дождя.",
    exampleVisuals: ["rain_house", "rain_umbrella", "rain_window_coffee"],
  },
  {
    id: "strange_vehicle",
    textKey: "play.challenge.draw.strangeVehicle",
    en: "Create a strange vehicle for two people.",
    ru: "Создайте странное транспортное средство для двоих.",
    exampleVisuals: ["rocket_vehicle", "tandem_vehicle", "balloon_vehicle"],
  },
  {
    id: "living_blob",
    textKey: "play.challenge.draw.livingBlob",
    en: "Turn an imaginary blob into something alive.",
    ru: "Дорисуйте воображаемую кляксу во что-то живое.",
    exampleVisuals: ["blob_eyes", "blob_leaf", "blob_bug"],
  },
  {
    id: "ideal_pet",
    textKey: "play.challenge.draw.idealPet",
    en: "Draw the ideal pet for this evening.",
    ru: "Нарисуйте идеального питомца для этого вечера.",
    exampleVisuals: ["crown_pet", "wing_pet", "big_ear_pet"],
  },
  {
    id: "tiny_island_map",
    textKey: "play.challenge.draw.tinyIslandMap",
    en: "Create a tiny map of an island only you two know.",
    ru: "Создайте маленькую карту острова, который знаете только вы двое.",
    exampleVisuals: ["island_map", "boat_island", "trail_island"],
  },
  {
    id: "evening_mood",
    textKey: "play.challenge.draw.eveningMood",
    en: "Draw the mood of this evening.",
    ru: "Нарисуйте настроение сегодняшнего вечера.",
    exampleVisuals: ["moon_mood", "lantern_mood", "sun_mood"],
  },
  {
    id: "house_for_two_strangers",
    textKey: "play.challenge.draw.houseForTwoStrangers",
    en: "Invent a small house for two strangers.",
    ru: "Придумайте домик для двух незнакомцев.",
    exampleVisuals: ["tiny_house", "two_window_house", "tree_house"],
  },
  {
    id: "funny_bicycle",
    textKey: "play.challenge.draw.funnyBicycle",
    en: "Draw the funniest bicycle you can imagine.",
    ru: "Нарисуйте самый смешной велосипед, который можете представить.",
    exampleVisuals: ["big_wheel_bike", "wing_bike", "balloon_bike"],
  },
] as const satisfies readonly PlayDrawChallengeDefinition[];

function releaseFallback(en: string, ru: string) {
  return getRuntimeLocale() === "ru" ? ru : en;
}

function resolveChallengeText(definition: PlayDrawChallengeDefinition) {
  const value = translate(getRuntimeLocale(), definition.textKey);
  return value === definition.textKey
    ? releaseFallback(definition.en, definition.ru)
    : value;
}

function hashSeed(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function mapChallenge(definition: PlayDrawChallengeDefinition): PlayDrawChallenge {
  return {
    id: definition.id,
    text: resolveChallengeText(definition),
    ...(definition.exampleVisuals?.length
      ? { exampleVisuals: [...definition.exampleVisuals] }
      : {}),
  };
}

export function getPlayDrawChallengePool() {
  return DRAW_CHALLENGE_DEFS.map(mapChallenge);
}

export function getPlayDrawChallengeById(challengeId: string): PlayDrawChallenge | null {
  const stableId = challengeId.trim();
  if (!stableId) return null;
  const challenge = DRAW_CHALLENGE_DEFS.find((item) => item.id === stableId) ?? null;
  return challenge ? mapChallenge(challenge) : null;
}

export function getPlayDrawChallengeForSeed(seed: string): PlayDrawChallenge {
  const safeSeed = seed.trim() || "draw";
  const index = hashSeed(safeSeed) % DRAW_CHALLENGE_DEFS.length;
  return mapChallenge(DRAW_CHALLENGE_DEFS[index] ?? DRAW_CHALLENGE_DEFS[0]);
}
