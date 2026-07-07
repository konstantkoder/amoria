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
  romantic: {
    glow: "rgba(255, 200, 87, 0.35)",
    badgeBg: "rgba(251, 191, 36, 0.25)",
    badgeText: "#FEF9C3",
  },
  playful: {
    glow: "rgba(244, 63, 94, 0.45)",
    badgeBg: "rgba(236, 72, 153, 0.35)",
    badgeText: "#FFE4E6",
  },
  chill: {
    glow: "rgba(79, 209, 197, 0.35)",
    badgeBg: "rgba(45, 212, 191, 0.22)",
    badgeText: "#ECFEFF",
  },
  curious: {
    glow: "rgba(56, 189, 248, 0.25)",
    badgeBg: "rgba(30, 64, 175, 0.55)",
    badgeText: "#E0F2FE",
  },
  adventurous: {
    glow: "rgba(168, 85, 247, 0.40)",
    badgeBg: "rgba(139, 92, 246, 0.30)",
    badgeText: "#F5F3FF",
  },
};

export const theme = {
  colors: {
    // общий фон приложения — ночной космос
    background: "#050816",
    backgroundAlt: "#120824",
    backgroundSoft: "#1A1025",
    screenBackground: "#050816",
    screenGradientTop: "#070B15",
    screenGradientBottom: "#120B1C",

    // карточки и панели
    card: "#181828",
    cardElevated: "#1F2030",
    surfaceBase: "rgba(7,11,21,0.78)",
    surfaceRaised: "rgba(12,16,30,0.88)",
    surfaceSoft: "rgba(255,255,255,0.06)",
    surfaceWarm: "rgba(245,194,77,0.10)",

    // текст
    text: "#F9FAFF",
    subtext: "#A3A8C3",
    muted: "#6B6F86",
    textPrimary: "#F9FAFF",
    textSecondary: "rgba(226,232,255,0.76)",
    textMuted: "rgba(226,232,255,0.56)",
    textAccent: "#F5C24D",

    // основные акценты (кнопки, лайки и т. п.)
    primary: "#FF4E8A",        // розово-малиновый
    primaryMuted: "#3A1221",
    accent: "#FF7A3C",         // тёплый оранжево-розовый
    accentSoft: "rgba(255, 122, 60, 0.14)",
    success: "#46E0C8",
    danger: "#FF4D67",
    goldLight: "#FFE8A3",
    gold: "#F5C24D",
    goldDeep: "#C88618",
    goldText: "#201306",
    goldBorder: "rgba(255,232,163,0.72)",
    goldGlow: "rgba(245,194,77,0.30)",
    primaryActionBg: "#F5C24D",
    primaryActionText: "#201306",
    primaryActionBorder: "rgba(255,232,163,0.72)",
    primaryActionPressedBg: "#E0A72D",
    secondaryActionBg: "rgba(255,255,255,0.07)",
    secondaryActionText: "#F5C24D",
    ghostActionText: "rgba(245,194,77,0.94)",
    chipBg: "rgba(255,255,255,0.07)",
    chipActiveBg: "rgba(245,194,77,0.16)",
    chipActiveBorder: "rgba(245,194,77,0.46)",
    dangerBg: "rgba(255,77,103,0.16)",
    dangerText: "#FFD2DA",
    successBg: "rgba(31,185,110,0.15)",
    successText: "#B9F6D2",
    warningBg: "rgba(245,194,77,0.13)",
    warningText: "#F5C24D",

    // табы
    tabActive: "#FF4E8A",
    tabInactive: "#757B9A",

    // плашки / pill-кнопки
    pillBg: "rgba(255, 255, 255, 0.05)",
    pillText: "#F5F5FF",

    // бордеры/разделители
    borderSubtle: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.18)",
    borderWarm: "rgba(245,194,77,0.38)",
    shadowColor: "#000000",
  },

  // оставляем радиус как число — для совместимости со старыми стилями
  radius: 20,
  spacing: 16,
  layout: {
    screenPadding: 14,
    sectionGap: 14,
    smallGap: 8,

    compactBreakpoint: 360,
    largeBreakpoint: 430,
  },

  // дополнительные формы (можно использовать в новых компонентах)
  shapes: {
    card: 24,
    cardInner: 18,
    pill: 999,
  },
  radii: {
    hero: 24,
    card: 22,
    inner: 18,
    button: 18,
    chip: 17,
    iconButton: 20,
    sheetTop: 24,
  },
  buttons: {
    primary: {
      height: 48,
      minHeight: 48,
      paddingHorizontal: 18,
      borderRadius: 18,
      borderWidth: 1,
      backgroundColor: "#F5C24D",
      borderColor: "rgba(255,232,163,0.72)",
      textColor: "#201306",
      fontSize: 15,
      lineHeight: 18,
      fontWeight: "900" as const,
      iconSize: 18,
      iconTextGap: 8,
      pressedScale: 0.98,
      pressedOpacity: 0.92,
      animationDurationMs: 120,
      disabledOpacity: 0.58,
    },

    secondary: {
      height: 44,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 17,
      borderWidth: 1,
      backgroundColor: "rgba(255,255,255,0.07)",
      borderColor: "rgba(245,194,77,0.30)",
      textColor: "#F5C24D",
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "900" as const,
      iconSize: 17,
      iconTextGap: 7,
      pressedScale: 0.985,
      pressedOpacity: 0.88,
      animationDurationMs: 120,
      disabledOpacity: 0.58,
    },

    ghost: {
      height: 36,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: "transparent",
      textColor: "rgba(245,194,77,0.94)",
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "900" as const,
      pressedOpacity: 0.62,
      disabledOpacity: 0.45,
    },

    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      iconSize: 18,
      iconColor: "#F9FAFF",
      pressedScale: 0.96,
      pressedOpacity: 0.82,
      disabledOpacity: 0.50,
    },

    chip: {
      height: 34,
      minHeight: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      borderWidth: 1,
      backgroundColor: "rgba(255,255,255,0.07)",
      borderColor: "rgba(255,255,255,0.12)",
      activeBackgroundColor: "rgba(245,194,77,0.16)",
      activeBorderColor: "rgba(245,194,77,0.46)",
      textColor: "rgba(226,232,255,0.86)",
      activeTextColor: "#F5C24D",
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900" as const,
      iconSize: 14,
      pressedScale: 0.98,
      pressedOpacity: 0.86,
    },

    danger: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 17,
      borderWidth: 1,
      backgroundColor: "rgba(255,77,103,0.16)",
      borderColor: "rgba(255,210,218,0.28)",
      textColor: "#FFD2DA",
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "900" as const,
      pressedScale: 0.985,
      pressedOpacity: 0.84,
    },
  },
  cards: {
    hero: {
      minHeight: 128,
      padding: 16,
      borderRadius: 24,
      backgroundColor: "rgba(12,16,30,0.82)",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
    },

    standard: {
      minHeight: 88,
      padding: 14,
      borderRadius: 22,
      backgroundColor: "rgba(9,14,32,0.72)",
      borderColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
    },

    compact: {
      minHeight: 64,
      padding: 12,
      borderRadius: 18,
      backgroundColor: "rgba(9,14,32,0.68)",
      borderColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
    },

    warning: {
      minHeight: 86,
      padding: 12,
      borderRadius: 18,
      backgroundColor: "rgba(245,194,77,0.13)",
      borderColor: "rgba(245,194,77,0.38)",
      borderWidth: 1,
    },

    error: {
      minHeight: 76,
      padding: 12,
      borderRadius: 18,
      backgroundColor: "rgba(255,77,103,0.16)",
      borderColor: "rgba(255,210,218,0.24)",
      borderWidth: 1,
    },

    success: {
      minHeight: 64,
      padding: 11,
      borderRadius: 16,
      backgroundColor: "rgba(31,185,110,0.15)",
      borderColor: "rgba(185,246,210,0.28)",
      borderWidth: 1,
    },
  },
  sheets: {
    backdropColor: "rgba(0,0,0,0.38)",
    backgroundColor: "rgba(7,11,21,0.98)",
    borderColor: "rgba(255,255,255,0.14)",
    minHeight: 320,
    maxHeightRatio: 0.72,
    maxHeight: 520,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    handleWidth: 36,
    handleHeight: 4,
    handleRadius: 2,
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
