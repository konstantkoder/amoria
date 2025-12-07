export type DemoNowGoal =
  | "dating"
  | "friends"
  | "chat"
  | "long_term"
  | "short_term"
  | "casual";

export type DemoNowMood =
  | "happy"
  | "chill"
  | "active"
  | "serious"
  | "party";

export type DemoNowRequest = {
  id: string;
  userName: string;
  age?: number;
  distanceKm: number;
  minutesAgo: number;
  text: string;
  goal: DemoNowGoal;
  mood: DemoNowMood;
  is18Plus?: boolean;
};

export const DEMO_NOW_REQUESTS: DemoNowRequest[] = [
  {
    id: "n1",
    userName: "Катя",
    age: 27,
    distanceKm: 2.3,
    minutesAgo: 5,
    text: "Ищу компанию на прогулку по набережной и кофе ☕️",
    goal: "dating",
    mood: "chill",
    is18Plus: false,
  },
  {
    id: "n2",
    userName: "Марко",
    age: 31,
    distanceKm: 0.8,
    minutesAgo: 2,
    text: "Сижу в баре в центре, хочется живого разговора без телефона 🍻",
    goal: "friends",
    mood: "happy",
    is18Plus: true,
  },
  {
    id: "n3",
    userName: "Ира",
    age: 24,
    distanceKm: 4.5,
    minutesAgo: 12,
    text: "Нужен напарник/кa на настолки и пиццу сегодня вечером 🎲",
    goal: "friends",
    mood: "active",
    is18Plus: false,
  },
  {
    id: "n4",
    userName: "Антон",
    age: 29,
    distanceKm: 1.1,
    minutesAgo: 3,
    text: "Кино сегодня? Устал свайпать, давай просто встретимся 🎬",
    goal: "dating",
    mood: "serious",
    is18Plus: true,
  },
  {
    id: "n5",
    userName: "Лена",
    age: 34,
    distanceKm: 6.2,
    minutesAgo: 25,
    text: "Хочу просто поболтать голосом, без фото и ожиданий.",
    goal: "chat",
    mood: "chill",
    is18Plus: false,
  },
  {
    id: "n6",
    userName: "Давид",
    age: 30,
    distanceKm: 3.7,
    minutesAgo: 9,
    text: "После работы ищу компанию на бокал вина и честный разговор 🍷",
    goal: "long_term",
    mood: "serious",
    is18Plus: true,
  },
  {
    id: "n7",
    userName: "Саша",
    age: 26,
    distanceKm: 0.4,
    minutesAgo: 1,
    text: "Кто рядом и тоже не спит? Готов выйти на быстрый кофе.",
    goal: "short_term",
    mood: "active",
    is18Plus: false,
  },
  {
    id: "n8",
    userName: "Mia",
    age: 28,
    distanceKm: 5.0,
    minutesAgo: 18,
    text: "Настроение «вечеринка», ищу компанию на бар/клуб 💃",
    goal: "casual",
    mood: "party",
    is18Plus: true,
  },
];
