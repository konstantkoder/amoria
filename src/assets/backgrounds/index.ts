export const backgrounds = {
  hearts: require("./hearts_feed.jpg"),
  smoke: require("./ads_wallpaper.jpg"),
  nightCity: require("./rooms_neon.jpg"),
  menu: require("./menu_glass.jpg"),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
