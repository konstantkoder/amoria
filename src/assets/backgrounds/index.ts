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
  startOnyxV4: require("./start_onyx_v4.png"),
  togetherOldBridgeV4: require("./together_old_bridge_v4.jpg"),
  nearbyOldCityV4: require("./nearby_old_city_v4.jpg"),
  chatsBlackGlassV4: require("./chats_black_glass_v4.png"),
  profileOnyxV4: require("./profile_onyx_v4.png"),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
