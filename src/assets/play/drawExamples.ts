import type { ImageSourcePropType } from "react-native";

const DRAW_EXAMPLE_IMAGE_SOURCES = {
  rainMood: require("../backgrounds/together_soft.jpg"),
  cozyHideout: require("../backgrounds/together_dream.jpg"),
  oddVehicle: require("../backgrounds/together_cosmos.jpg"),
  sharedRoute: require("../backgrounds/together_story.png"),
  livingShape: require("../backgrounds/together_main.png"),
  eveningGlow: require("../backgrounds/together_soft.jpg"),
} as const;

export type DrawExampleImageId = keyof typeof DRAW_EXAMPLE_IMAGE_SOURCES;

export function getDrawExampleImageSource(
  id: string
): ImageSourcePropType | null {
  return DRAW_EXAMPLE_IMAGE_SOURCES[id as DrawExampleImageId] ?? null;
}
