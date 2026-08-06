import type { ImageSourcePropType } from "react-native";

const DEFAULT_ART = require("./prompts-v6/draw_default.jpg");

const PROMPT_ART: Readonly<Record<string, ImageSourcePropType>> = {
  "draw.tinyPlace": require("./prompts-v6/draw_tiny_place.jpg"),
  "draw.firstMeeting": require("./prompts-v6/draw_first_meeting.jpg"),
  "draw.dreamRoom": require("./prompts-v6/draw_dream_room.jpg"),
};

export function getTogetherPromptArt(
  promptKey: string | null | undefined,
): ImageSourcePropType {
  return promptKey ? PROMPT_ART[promptKey] ?? DEFAULT_ART : DEFAULT_ART;
}
