const ACTIVITY_ART: Readonly<Record<string, string>> = {
  coffee_nearby: "coffee.jpg", walk_nearby: "evening_walk.jpg", bike_nearby: "bike.jpg",
  cinema_today: "cinema.jpg", talk_nearby: "talk.jpg", evening_nearby: "evening_walk.jpg",
  roller_skating_nearby: "movement.jpg", kayaking_nearby: "water.jpg", fishing_nearby: "water.jpg",
  sport_nearby: "team_sports.jpg", language_exchange_nearby: "talk.jpg", local_event_nearby: "festival.jpg",
  lunch_nearby: "dinner.jpg", dinner_nearby: "dinner.jpg", dessert_nearby: "coffee.jpg",
  board_games_nearby: "board_games.jpg", chess_nearby: "board_games.jpg", book_club_nearby: "board_games.jpg",
  study_work_nearby: "board_games.jpg", skateboarding_nearby: "movement.jpg", running_nearby: "movement.jpg",
  gym_nearby: "movement.jpg", yoga_nearby: "movement.jpg", dance_nearby: "movement.jpg",
  football_nearby: "team_sports.jpg", basketball_nearby: "team_sports.jpg", volleyball_nearby: "team_sports.jpg",
  tennis_nearby: "racket_sports.jpg", table_tennis_nearby: "racket_sports.jpg", badminton_nearby: "racket_sports.jpg",
  beach_swim_nearby: "water.jpg", picnic_nearby: "nature.jpg", hiking_nearby: "nature.jpg",
  dog_walk_nearby: "nature.jpg", concert_nearby: "live_music.jpg", museum_exhibition_nearby: "culture.jpg",
  theater_nearby: "culture.jpg", live_music_nearby: "live_music.jpg", festival_nearby: "festival.jpg",
  photography_nearby: "creative.jpg", cooking_nearby: "creative.jpg", volunteering_nearby: "community.jpg",
  gaming_nearby: "gaming.jpg",
};

export function getNearbyActivityArtUrl(typeKey: string | null | undefined): string {
  return `/activity-art/${typeKey ? ACTIVITY_ART[typeKey] ?? "default.jpg" : "default.jpg"}`;
}
