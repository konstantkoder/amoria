export const backgrounds = {
  hearts: require("./hearts_feed.jpg"),
  togetherMain: require("./together_main.png"),
  togetherStory: require("./together_story.png"),
  togetherChat: require("./together_chat.png"),
  smoke: require("./ads_wallpaper.jpg"),
  nightCity: require("./rooms_neon.jpg"),
  menu: require("./menu_glass.jpg"),
  ads: require("./bg_ads.jpg"),
  now: require("./bg_now.jpg"),
  rooms: require("./bg_rooms.jpg"),
  profile: require("./bg_profile.jpg"),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
