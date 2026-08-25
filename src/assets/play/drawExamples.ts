import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type DrawExampleVisualId =
  | "rain_house"
  | "rain_umbrella"
  | "rain_window_coffee"
  | "rocket_vehicle"
  | "tandem_vehicle"
  | "balloon_vehicle"
  | "blob_eyes"
  | "blob_leaf"
  | "blob_bug"
  | "crown_pet"
  | "wing_pet"
  | "big_ear_pet"
  | "island_map"
  | "boat_island"
  | "trail_island"
  | "moon_mood"
  | "lantern_mood"
  | "sun_mood"
  | "tiny_house"
  | "two_window_house"
  | "tree_house"
  | "big_wheel_bike"
  | "wing_bike"
  | "balloon_bike";

export type DrawExampleVisual = {
  id: DrawExampleVisualId;
  icon: IconName;
  secondaryIcon?: IconName;
  labelKey: string;
};

const DRAW_EXAMPLE_VISUALS: Record<DrawExampleVisualId, DrawExampleVisual> = {
  rain_house: {
    id: "rain_house",
    icon: "home-outline",
    secondaryIcon: "rainy-outline",
    labelKey: "play.canvas.example.rainHouse",
  },
  rain_umbrella: {
    id: "rain_umbrella",
    icon: "umbrella-outline",
    secondaryIcon: "rainy-outline",
    labelKey: "play.canvas.example.rainUmbrella",
  },
  rain_window_coffee: {
    id: "rain_window_coffee",
    icon: "cafe-outline",
    secondaryIcon: "home-outline",
    labelKey: "play.canvas.example.rainCoffee",
  },
  rocket_vehicle: {
    id: "rocket_vehicle",
    icon: "rocket-outline",
    secondaryIcon: "people-outline",
    labelKey: "play.canvas.example.rocketVehicle",
  },
  tandem_vehicle: {
    id: "tandem_vehicle",
    icon: "car-sport-outline",
    secondaryIcon: "sparkles-outline",
    labelKey: "play.canvas.example.tandemVehicle",
  },
  balloon_vehicle: {
    id: "balloon_vehicle",
    icon: "balloon-outline",
    secondaryIcon: "boat-outline",
    labelKey: "play.canvas.example.balloonVehicle",
  },
  blob_eyes: {
    id: "blob_eyes",
    icon: "ellipse-outline",
    secondaryIcon: "eye-outline",
    labelKey: "play.canvas.example.blobEyes",
  },
  blob_leaf: {
    id: "blob_leaf",
    icon: "ellipse-outline",
    secondaryIcon: "leaf-outline",
    labelKey: "play.canvas.example.blobLeaf",
  },
  blob_bug: {
    id: "blob_bug",
    icon: "bug-outline",
    secondaryIcon: "ellipse-outline",
    labelKey: "play.canvas.example.doodleBug",
  },
  crown_pet: {
    id: "crown_pet",
    icon: "paw-outline",
    secondaryIcon: "sparkles-outline",
    labelKey: "play.canvas.example.crownPet",
  },
  wing_pet: {
    id: "wing_pet",
    icon: "paw-outline",
    secondaryIcon: "airplane-outline",
    labelKey: "play.canvas.example.wingPet",
  },
  big_ear_pet: {
    id: "big_ear_pet",
    icon: "paw-outline",
    secondaryIcon: "radio-button-off-outline",
    labelKey: "play.canvas.example.bigEarPet",
  },
  island_map: {
    id: "island_map",
    icon: "map-outline",
    secondaryIcon: "ellipse-outline",
    labelKey: "play.canvas.example.islandMap",
  },
  boat_island: {
    id: "boat_island",
    icon: "boat-outline",
    secondaryIcon: "map-outline",
    labelKey: "play.canvas.example.boatIsland",
  },
  trail_island: {
    id: "trail_island",
    icon: "trail-sign-outline",
    secondaryIcon: "map-outline",
    labelKey: "play.canvas.example.trailIsland",
  },
  moon_mood: {
    id: "moon_mood",
    icon: "moon-outline",
    secondaryIcon: "sparkles-outline",
    labelKey: "play.canvas.example.moonMood",
  },
  lantern_mood: {
    id: "lantern_mood",
    icon: "bulb-outline",
    secondaryIcon: "trail-sign-outline",
    labelKey: "play.canvas.example.lanternMood",
  },
  sun_mood: {
    id: "sun_mood",
    icon: "sunny-outline",
    secondaryIcon: "cloudy-outline",
    labelKey: "play.canvas.example.sunMood",
  },
  tiny_house: {
    id: "tiny_house",
    icon: "home-outline",
    secondaryIcon: "people-outline",
    labelKey: "play.canvas.example.tinyHouse",
  },
  two_window_house: {
    id: "two_window_house",
    icon: "home-outline",
    secondaryIcon: "grid-outline",
    labelKey: "play.canvas.example.twoWindowHouse",
  },
  tree_house: {
    id: "tree_house",
    icon: "home-outline",
    secondaryIcon: "leaf-outline",
    labelKey: "play.canvas.example.treeHouse",
  },
  big_wheel_bike: {
    id: "big_wheel_bike",
    icon: "bicycle-outline",
    secondaryIcon: "radio-button-off-outline",
    labelKey: "play.canvas.example.bigWheelBike",
  },
  wing_bike: {
    id: "wing_bike",
    icon: "bicycle-outline",
    secondaryIcon: "airplane-outline",
    labelKey: "play.canvas.example.wingBike",
  },
  balloon_bike: {
    id: "balloon_bike",
    icon: "bicycle-outline",
    secondaryIcon: "balloon-outline",
    labelKey: "play.canvas.example.balloonBike",
  },
};

export function getDrawExampleVisual(id: string): DrawExampleVisual | null {
  return DRAW_EXAMPLE_VISUALS[id as DrawExampleVisualId] ?? null;
}
