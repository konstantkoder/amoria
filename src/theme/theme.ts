import type { Mood } from "@/models/User";
import { visualSystem } from "@/theme/visualSystem";

type MoodKey = Mood | "default";

type MoodPalette = {
  glow: string;
  badgeBg: string;
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
    background: visualSystem.colors.background,
    backgroundAlt: visualSystem.colors.backgroundRaised,
    backgroundSoft: visualSystem.colors.backgroundElevated,
    backgroundRaised: visualSystem.colors.backgroundRaised,
    backgroundElevated: visualSystem.colors.backgroundElevated,
    screenBackground: visualSystem.colors.background,
    screenGradientTop: "#070B15",
    screenGradientBottom: "#120B1C",

    card: visualSystem.colors.backgroundRaised,
    cardElevated: visualSystem.colors.backgroundElevated,
    surfaceBase: visualSystem.colors.surface,
    surfaceRaised: visualSystem.colors.surfaceRaised,
    surfaceSoft: visualSystem.colors.surfaceSoft,
    surfaceWarm: visualSystem.colors.accentSoft,

    text: visualSystem.colors.text,
    textWarm: visualSystem.colors.textWarm,
    subtext: visualSystem.colors.textSecondary,
    muted: visualSystem.colors.textMuted,
    textPrimary: visualSystem.colors.text,
    textSecondary: visualSystem.colors.textSecondary,
    textMuted: visualSystem.colors.textMuted,
    textAccent: visualSystem.colors.accent,
    glass: visualSystem.colors.surface,
    glassStrong: visualSystem.colors.surfaceRaised,
    glassSoft: visualSystem.colors.surfaceSoft,
    glassPressed: visualSystem.colors.surfacePressed,
    goldBright: "#F3C98B",

    primary: visualSystem.colors.primaryBg,
    primaryMuted: "#2D171B",
    accent: visualSystem.colors.secondaryAccent,
    accentSoft: visualSystem.colors.accentSoft,
    success: "#78C58D",
    danger: "#D95C4B",

    /** @deprecated Compatibility alias; use semantic visual-system roles. */
    goldLight: visualSystem.colors.textWarm,
    /** @deprecated Compatibility alias; use semantic visual-system roles. */
    gold: visualSystem.colors.accent,
    /** @deprecated Compatibility alias; use semantic visual-system roles. */
    goldDeep: visualSystem.colors.secondaryAccent,
    /** @deprecated Compatibility alias; use semantic visual-system roles. */
    goldText: visualSystem.colors.primaryText,
    /** @deprecated Compatibility alias; use semantic visual-system roles. */
    goldBorder: visualSystem.colors.accentBorder,
    /** @deprecated Compatibility alias; use semantic visual-system roles. */
    goldGlow: visualSystem.colors.accentSoft,

    primaryActionBg: visualSystem.colors.primaryBg,
    primaryActionText: visualSystem.colors.primaryText,
    primaryActionBorder: visualSystem.colors.primaryBorder,
    primaryActionPressedBg: visualSystem.colors.primaryPressedBg,
    secondaryActionBg: visualSystem.colors.secondaryBg,
    secondaryActionText: visualSystem.colors.secondaryText,
    ghostActionText: visualSystem.colors.accent,
    chipBg: visualSystem.colors.surfaceSoft,
    chipActiveBg: visualSystem.colors.selectedBg,
    chipActiveBorder: visualSystem.colors.selectedBorder,
    dangerBg: visualSystem.colors.dangerBg,
    dangerText: visualSystem.colors.dangerText,
    successBg: visualSystem.colors.successBg,
    successText: visualSystem.colors.successText,
    warningBg: visualSystem.colors.warningBg,
    warningText: visualSystem.colors.warningText,

    tabActive: visualSystem.colors.navActive,
    tabInactive: visualSystem.colors.navInactive,

    pillBg: "rgba(255, 255, 255, 0.05)",
    pillText: visualSystem.colors.textWarm,

    borderSubtle: visualSystem.colors.border,
    borderStrong: visualSystem.colors.borderStrong,
    borderWarm: visualSystem.colors.accentBorder,
    shadowColor: "#000000",
  },

  radius: 22,
  spacing: 16,
  layout: {
    screenPadding: 16,
    sectionGap: 16,
    smallGap: 8,
    compactBreakpoint: 360,
    largeBreakpoint: 430,
  },

  shapes: {
    card: 28,
    cardInner: visualSystem.cards.innerRadius,
    pill: 999,
  },
  radii: {
    hero: 28,
    card: visualSystem.cards.radius,
    inner: visualSystem.cards.innerRadius,
    button: visualSystem.buttons.primary.borderRadius,
    chip: visualSystem.buttons.chip.borderRadius,
    iconButton: visualSystem.buttons.icon.borderRadius,
    sheetTop: 24,
  },
  buttons: {
    primary: {
      height: visualSystem.buttons.primary.minHeight,
      minHeight: visualSystem.buttons.primary.minHeight,
      paddingHorizontal: visualSystem.buttons.primary.paddingHorizontal,
      borderRadius: visualSystem.buttons.primary.borderRadius,
      borderWidth: 1,
      backgroundColor: visualSystem.colors.primaryBg,
      pressedBackgroundColor: visualSystem.colors.primaryPressedBg,
      borderColor: visualSystem.colors.primaryBorder,
      textColor: visualSystem.colors.primaryText,
      fontSize: visualSystem.buttons.primary.fontSize,
      lineHeight: visualSystem.buttons.primary.lineHeight,
      fontWeight: visualSystem.buttons.primary.fontWeight,
      iconSize: visualSystem.buttons.primary.iconSize,
      iconTextGap: visualSystem.buttons.primary.gap,
      pressedScale: 0.98,
      pressedOpacity: 0.92,
      animationDurationMs: 120,
      disabledOpacity: 0.58,
    },

    secondary: {
      height: visualSystem.buttons.secondary.minHeight,
      minHeight: visualSystem.buttons.secondary.minHeight,
      paddingHorizontal: visualSystem.buttons.secondary.paddingHorizontal,
      borderRadius: visualSystem.buttons.secondary.borderRadius,
      borderWidth: 1,
      backgroundColor: visualSystem.colors.secondaryBg,
      pressedBackgroundColor: visualSystem.colors.secondaryPressedBg,
      borderColor: visualSystem.colors.secondaryBorder,
      textColor: visualSystem.colors.secondaryText,
      fontSize: visualSystem.buttons.secondary.fontSize,
      lineHeight: visualSystem.buttons.secondary.lineHeight,
      fontWeight: visualSystem.buttons.secondary.fontWeight,
      iconSize: visualSystem.buttons.secondary.iconSize,
      iconTextGap: visualSystem.buttons.secondary.gap,
      pressedScale: 0.985,
      pressedOpacity: 0.88,
      animationDurationMs: 120,
      disabledOpacity: 0.58,
    },

    ghost: {
      height: visualSystem.buttons.compact.minHeight,
      minHeight: visualSystem.buttons.compact.minHeight,
      paddingHorizontal: visualSystem.buttons.compact.paddingHorizontal,
      borderRadius: visualSystem.buttons.compact.borderRadius,
      backgroundColor: "transparent",
      textColor: visualSystem.colors.secondaryText,
      fontSize: visualSystem.buttons.compact.fontSize,
      lineHeight: visualSystem.buttons.compact.lineHeight,
      fontWeight: visualSystem.buttons.compact.fontWeight,
      iconSize: visualSystem.buttons.compact.iconSize,
      iconTextGap: visualSystem.buttons.compact.gap,
      pressedOpacity: 0.62,
      disabledOpacity: 0.45,
    },

    icon: {
      width: visualSystem.buttons.icon.width,
      height: visualSystem.buttons.icon.height,
      borderRadius: visualSystem.buttons.icon.borderRadius,
      backgroundColor: visualSystem.colors.surfaceSoft,
      pressedBackgroundColor: visualSystem.colors.surfacePressed,
      borderColor: visualSystem.colors.border,
      borderWidth: 1,
      iconSize: visualSystem.buttons.icon.iconSize,
      iconColor: visualSystem.colors.textWarm,
      pressedScale: 0.96,
      pressedOpacity: 0.82,
      disabledOpacity: 0.5,
    },

    chip: {
      height: visualSystem.buttons.chip.minHeight,
      minHeight: visualSystem.buttons.chip.minHeight,
      paddingHorizontal: visualSystem.buttons.chip.paddingHorizontal,
      borderRadius: visualSystem.buttons.chip.borderRadius,
      borderWidth: 1,
      backgroundColor: visualSystem.colors.surfaceSoft,
      borderColor: visualSystem.colors.border,
      activeBackgroundColor: visualSystem.colors.selectedBg,
      activeBorderColor: visualSystem.colors.selectedBorder,
      textColor: "rgba(226,232,255,0.84)",
      activeTextColor: visualSystem.colors.selectedText,
      fontSize: visualSystem.buttons.chip.fontSize,
      lineHeight: visualSystem.buttons.chip.lineHeight,
      fontWeight: visualSystem.buttons.chip.fontWeight,
      iconSize: visualSystem.buttons.compact.iconSize,
      pressedScale: 0.98,
      pressedOpacity: 0.86,
    },

    danger: {
      height: visualSystem.buttons.secondary.minHeight,
      paddingHorizontal: visualSystem.buttons.secondary.paddingHorizontal,
      borderRadius: visualSystem.buttons.secondary.borderRadius,
      borderWidth: 1,
      backgroundColor: visualSystem.colors.dangerBg,
      borderColor: visualSystem.colors.dangerBorder,
      textColor: visualSystem.colors.dangerText,
      fontSize: visualSystem.buttons.secondary.fontSize,
      lineHeight: visualSystem.buttons.secondary.lineHeight,
      fontWeight: visualSystem.buttons.secondary.fontWeight,
      pressedScale: 0.985,
      pressedOpacity: 0.84,
    },
  },
  cards: {
    hero: {
      minHeight: 128,
      padding: visualSystem.cards.padding,
      borderRadius: 24,
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
    },
    standard: {
      minHeight: 88,
      padding: 14,
      borderRadius: visualSystem.cards.radius,
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
    },
    compact: {
      minHeight: 64,
      padding: visualSystem.cards.compactPadding,
      borderRadius: visualSystem.cards.innerRadius,
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
    },
    warning: {
      minHeight: 86,
      padding: visualSystem.cards.compactPadding,
      borderRadius: visualSystem.cards.innerRadius,
      backgroundColor: visualSystem.colors.warningBg,
      borderColor: visualSystem.colors.warningBorder,
      borderWidth: 1,
    },
    error: {
      minHeight: 76,
      padding: visualSystem.cards.compactPadding,
      borderRadius: visualSystem.cards.innerRadius,
      backgroundColor: visualSystem.colors.dangerBg,
      borderColor: visualSystem.colors.dangerBorder,
      borderWidth: 1,
    },
    success: {
      minHeight: 64,
      padding: 11,
      borderRadius: 16,
      backgroundColor: visualSystem.colors.successBg,
      borderColor: visualSystem.colors.successBorder,
      borderWidth: 1,
    },
  },
  sheets: {
    backdropColor: "rgba(0,0,0,0.38)",
    backgroundColor: "rgba(7,11,21,0.98)",
    borderColor: visualSystem.colors.border,
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
  mood: moodPalettes,
};

export function getMoodTheme(mood?: Mood | null): MoodPalette {
  if (!mood) return moodPalettes.default;
  return moodPalettes[mood] ?? moodPalettes.default;
}
