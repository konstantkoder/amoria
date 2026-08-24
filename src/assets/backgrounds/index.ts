export const backgrounds = {
  startLighthouseV6: require("./v6/lighthouse_v6.jpg"),
  togetherObservatoryV6: require("./v6/observatory_v6.jpg"),
  togetherSearchLighthouseV6: require("./v6/lighthouse_v6.jpg"),
  nearbyHarborV6: require("./v6/harbor_v6.jpg"),
  chatCanalV6: require("./v6/canal_v6.jpg"),
  profileArchGardenV6: require("./v6/arch_garden_v6.jpg"),
  drawerLanternStreetV6: require("./v6/drawer_lantern_street_v6.jpg"),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
