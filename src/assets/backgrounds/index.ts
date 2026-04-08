export const backgrounds = {
  hearts: require("./hearts_feed.jpg"),
  togetherDream: require("./together_dream.jpg"),
  togetherCosmos: require("./together_cosmos.jpg"),
  togetherSoft: require("./together_soft.jpg"),
  smoke: require("./ads_wallpaper.jpg"),
  nightCity: require("./rooms_neon.jpg"),
  menu: require("./menu_glass.jpg"),
  ads: require("./bg_ads.jpg"),
  now: require("./bg_now.jpg"),
  chats: require("./bg_chats.jpg"),
  rooms: require("./bg_rooms.jpg"),
  profile: require("./bg_profile.jpg"),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
