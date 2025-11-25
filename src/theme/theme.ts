import type { Mood } from "@/models/User";

type MoodKey = Mood | "default";

type MoodPalette = {
  /** фон/подсветка вокруг */
  glow: string;
  /** фон бэйджа настроения */
  badgeBg: string;
  /** цвет текста бэйджа */
  badgeText: string;
};

const moodPalettes: Record<MoodKey, MoodPalette> = {
  default: {
    glow: "rgba(255, 255, 255, 0.04)",
    badgeBg: "rgba(148, 163, 253, 0.20)",
    badgeText: "#E5E7FF",
  },
  happy: {
    glow: "rgba(255, 200, 87, 0.35)",
    badgeBg: "rgba(251, 191, 36, 0.25)",
    badgeText: "#FEF9C3",
  },
  chill: {
    glow: "rgba(79, 209, 197, 0.35)",
    badgeBg: "rgba(45, 212, 191, 0.22)",
    badgeText: "#ECFEFF",
  },
  active: {
    glow: "rgba(168, 85, 247, 0.40)",
    badgeBg: "rgba(139, 92, 246, 0.30)",
    badgeText: "#F5F3FF",
  },
  serious: {
    glow: "rgba(56, 189, 248, 0.25)",
    badgeBg: "rgba(30, 64, 175, 0.55)",
    badgeText: "#E0F2FE",
  },
  party: {
    glow: "rgba(244, 63, 94, 0.45)",
    badgeBg: "rgba(236, 72, 153, 0.35)",
    badgeText: "#FFE4E6",
  },
};

export const theme = {
  colors: {
    // общий фон приложения — ночной космос
    background: "#050816",
    backgroundAlt: "#120824",
    backgroundSoft: "#1A1025",

    // карточки и панели
    card: "#181828",
    cardElevated: "#1F2030",

    // текст
    text: "#F9FAFF",
    subtext: "#A3A8C3",
    muted: "#6B6F86",

    // основные акценты (кнопки, лайки и т. п.)
    primary: "#FF4E8A",        // розово-малиновый
    primaryMuted: "#3A1221",
    accent: "#FF7A3C",         // тёплый оранжево-розовый
    accentSoft: "rgba(255, 122, 60, 0.14)",
    success: "#46E0C8",
    danger: "#FF4D67",

    // табы
    tabActive: "#FF4E8A",
    tabInactive: "#757B9A",

    // плашки / pill-кнопки
    pillBg: "rgba(255, 255, 255, 0.05)",
    pillText: "#F5F5FF",

    // бордеры/разделители
    borderSubtle: "rgba(255, 255, 255, 0.08)",
  },

  // оставляем радиус как число — для совместимости со старыми стилями
  radius: 20,
  spacing: 16,

  // дополнительные формы (можно использовать в новых компонентах)
  shapes: {
    card: 24,
    cardInner: 18,
    pill: 999,
  },

  // палитра по настроениям
  mood: moodPalettes,
};

/**
 * Вспомогательная функция, чтобы быстро получить цвета по настроению.
 */
export function getMoodTheme(mood?: Mood | null): MoodPalette {
  if (!mood) return moodPalettes.default;
  return moodPalettes[mood] ?? moodPalettes.default;
}
