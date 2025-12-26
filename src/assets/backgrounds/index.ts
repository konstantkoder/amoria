export const backgrounds = {
  hearts: require("./hearts.png"),
  smoke: require("./smoke.png"),
  nightCity: require("./night_city.png"),
  softDarkGradient: require("./liquid.png"),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
