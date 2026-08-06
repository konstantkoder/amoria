import type { ImageSourcePropType } from "react-native";

const DEFAULT_ART = require("./activity-art-v6/default.jpg");

const ACTIVITY_ART: Readonly<Record<string, ImageSourcePropType>> = {
  coffee_nearby: require("./activity-art-v6/coffee_nearby.jpg"),
  walk_nearby: require("./activity-art-v6/walk_nearby.jpg"),
  bike_nearby: require("./activity-art-v6/bike_nearby.jpg"),
  cinema_today: require("./activity-art-v6/cinema_today.jpg"),
  talk_nearby: require("./activity-art-v6/talk_nearby.jpg"),
  evening_nearby: require("./activity-art-v6/evening_nearby.jpg"),
  roller_skating_nearby: require("./activity-art-v6/roller_skating_nearby.jpg"),
  kayaking_nearby: require("./activity-art-v6/kayaking_nearby.jpg"),
  fishing_nearby: require("./activity-art-v6/fishing_nearby.jpg"),
  sport_nearby: require("./activity-art-v6/sport_nearby.jpg"),
  language_exchange_nearby: require("./activity-art-v6/language_exchange_nearby.jpg"),
  local_event_nearby: require("./activity-art-v6/local_event_nearby.jpg"),
  lunch_nearby: require("./activity-art-v6/lunch_nearby.jpg"),
  dinner_nearby: require("./activity-art-v6/dinner_nearby.jpg"),
  dessert_nearby: require("./activity-art-v6/dessert_nearby.jpg"),
  board_games_nearby: require("./activity-art-v6/board_games_nearby.jpg"),
  chess_nearby: require("./activity-art-v6/chess_nearby.jpg"),
  book_club_nearby: require("./activity-art-v6/book_club_nearby.jpg"),
  study_work_nearby: require("./activity-art-v6/study_work_nearby.jpg"),
  skateboarding_nearby: require("./activity-art-v6/skateboarding_nearby.jpg"),
  running_nearby: require("./activity-art-v6/running_nearby.jpg"),
  gym_nearby: require("./activity-art-v6/gym_nearby.jpg"),
  yoga_nearby: require("./activity-art-v6/yoga_nearby.jpg"),
  dance_nearby: require("./activity-art-v6/dance_nearby.jpg"),
  football_nearby: require("./activity-art-v6/football_nearby.jpg"),
  basketball_nearby: require("./activity-art-v6/basketball_nearby.jpg"),
  volleyball_nearby: require("./activity-art-v6/volleyball_nearby.jpg"),
  tennis_nearby: require("./activity-art-v6/tennis_nearby.jpg"),
  table_tennis_nearby: require("./activity-art-v6/table_tennis_nearby.jpg"),
  badminton_nearby: require("./activity-art-v6/badminton_nearby.jpg"),
  beach_swim_nearby: require("./activity-art-v6/beach_swim_nearby.jpg"),
  picnic_nearby: require("./activity-art-v6/picnic_nearby.jpg"),
  hiking_nearby: require("./activity-art-v6/hiking_nearby.jpg"),
  dog_walk_nearby: require("./activity-art-v6/dog_walk_nearby.jpg"),
  concert_nearby: require("./activity-art-v6/concert_nearby.jpg"),
  museum_exhibition_nearby: require("./activity-art-v6/museum_exhibition_nearby.jpg"),
  theater_nearby: require("./activity-art-v6/theater_nearby.jpg"),
  live_music_nearby: require("./activity-art-v6/live_music_nearby.jpg"),
  festival_nearby: require("./activity-art-v6/festival_nearby.jpg"),
  photography_nearby: require("./activity-art-v6/photography_nearby.jpg"),
  cooking_nearby: require("./activity-art-v6/cooking_nearby.jpg"),
  volunteering_nearby: require("./activity-art-v6/volunteering_nearby.jpg"),
  gaming_nearby: require("./activity-art-v6/gaming_nearby.jpg"),
};

export function getNearbyActivityArt(
  typeKey: string | null | undefined,
): ImageSourcePropType {
  return typeKey ? ACTIVITY_ART[typeKey] ?? DEFAULT_ART : DEFAULT_ART;
}
