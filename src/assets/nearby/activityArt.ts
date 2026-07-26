import type { ImageSourcePropType } from "react-native";

const DEFAULT_ART = require("./activity-art/default.jpg");

const ACTIVITY_ART: Readonly<Record<string, ImageSourcePropType>> = {
  coffee_nearby: require("./activity-art/coffee.jpg"),
  walk_nearby: require("./activity-art/evening_walk.jpg"),
  bike_nearby: require("./activity-art/bike.jpg"),
  cinema_today: require("./activity-art/cinema.jpg"),
  talk_nearby: require("./activity-art/talk.jpg"),
  evening_nearby: require("./activity-art/evening_walk.jpg"),
  roller_skating_nearby: require("./activity-art/movement.jpg"),
  kayaking_nearby: require("./activity-art/water.jpg"),
  fishing_nearby: require("./activity-art/water.jpg"),
  sport_nearby: require("./activity-art/team_sports.jpg"),
  language_exchange_nearby: require("./activity-art/talk.jpg"),
  local_event_nearby: require("./activity-art/festival.jpg"),
  lunch_nearby: require("./activity-art/dinner.jpg"),
  dinner_nearby: require("./activity-art/dinner.jpg"),
  dessert_nearby: require("./activity-art/coffee.jpg"),
  board_games_nearby: require("./activity-art/board_games.jpg"),
  chess_nearby: require("./activity-art/board_games.jpg"),
  book_club_nearby: require("./activity-art/board_games.jpg"),
  study_work_nearby: require("./activity-art/board_games.jpg"),
  skateboarding_nearby: require("./activity-art/movement.jpg"),
  running_nearby: require("./activity-art/movement.jpg"),
  gym_nearby: require("./activity-art/movement.jpg"),
  yoga_nearby: require("./activity-art/movement.jpg"),
  dance_nearby: require("./activity-art/movement.jpg"),
  football_nearby: require("./activity-art/team_sports.jpg"),
  basketball_nearby: require("./activity-art/team_sports.jpg"),
  volleyball_nearby: require("./activity-art/team_sports.jpg"),
  tennis_nearby: require("./activity-art/racket_sports.jpg"),
  table_tennis_nearby: require("./activity-art/racket_sports.jpg"),
  badminton_nearby: require("./activity-art/racket_sports.jpg"),
  beach_swim_nearby: require("./activity-art/water.jpg"),
  picnic_nearby: require("./activity-art/nature.jpg"),
  hiking_nearby: require("./activity-art/nature.jpg"),
  dog_walk_nearby: require("./activity-art/nature.jpg"),
  concert_nearby: require("./activity-art/live_music.jpg"),
  museum_exhibition_nearby: require("./activity-art/culture.jpg"),
  theater_nearby: require("./activity-art/culture.jpg"),
  live_music_nearby: require("./activity-art/live_music.jpg"),
  festival_nearby: require("./activity-art/festival.jpg"),
  photography_nearby: require("./activity-art/creative.jpg"),
  cooking_nearby: require("./activity-art/creative.jpg"),
  volunteering_nearby: require("./activity-art/community.jpg"),
  gaming_nearby: require("./activity-art/gaming.jpg"),
};

export function getNearbyActivityArt(
  typeKey: string | null | undefined,
): ImageSourcePropType {
  return typeKey ? ACTIVITY_ART[typeKey] ?? DEFAULT_ART : DEFAULT_ART;
}
