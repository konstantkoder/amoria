export type BackgroundKey =
  | "hearts"
  | "smoke"
  | "nightCity"
  | "menu";

export const backgrounds: Record<BackgroundKey, any> = {
  hearts: require("./hearts.png"),
  smoke: require("./smoke.png"),
  nightCity: require("./rooms_neon.jpg"),
  menu: require("./menu_glass.jpg"),
};
