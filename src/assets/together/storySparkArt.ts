import type { ImageSourcePropType } from "react-native";

const STORY_SPARK_ART: Readonly<Record<string, ImageSourcePropType>> = {
  night_train: require("./story-sparks-v6/place/night_train.jpg"),
  small_cafe: require("./story-sparks-v6/place/small_cafe.jpg"),
  rooftop_after_rain: require("./story-sparks-v6/place/rooftop_after_rain.jpg"),
  lost_key: require("./story-sparks-v6/detail/lost_key.jpg"),
  old_camera: require("./story-sparks-v6/detail/old_camera.jpg"),
  unsigned_note: require("./story-sparks-v6/detail/unsigned_note.jpg"),
  lights_went_out: require("./story-sparks-v6/twist/lights_went_out.jpg"),
  recognized_melody: require("./story-sparks-v6/twist/recognized_melody.jpg"),
  door_opened_itself: require("./story-sparks-v6/twist/door_opened_itself.jpg"),
  meet_again: require("./story-sparks-v6/ending/meet_again.jpg"),
  all_a_joke: require("./story-sparks-v6/ending/all_a_joke.jpg"),
  story_began: require("./story-sparks-v6/ending/story_began.jpg"),
};

export function getStorySparkArt(cardId: string): ImageSourcePropType | undefined {
  return STORY_SPARK_ART[cardId];
}
