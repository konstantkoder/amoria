export const visualSystem = {
  colors: {
    background: "#050816",
    backgroundRaised: "#0C0F1A",
    backgroundElevated: "#171726",

    surface: "rgba(5,8,22,0.14)",
    surfaceRaised: "rgba(5,8,22,0.22)",
    surfaceSoft: "rgba(255,255,255,0.045)",
    surfacePressed: "rgba(255,255,255,0.075)",

    border: "rgba(230,185,118,0.08)",
    borderStrong: "rgba(230,185,118,0.16)",

    text: "#F9FAFF",
    textWarm: "#FFF8EA",
    textSecondary: "rgba(249,250,255,0.72)",
    textMuted: "#8E9484",

    accent: "#E6B976",
    accentSoft: "rgba(230,185,118,0.11)",
    accentBorder: "rgba(230,185,118,0.34)",

    primaryBg: "#E6B976",
    primaryPressedBg: "#D3A55F",
    primaryText: "#120E08",
    primaryBorder: "rgba(230,185,118,0.34)",

    secondaryAccent: "#A88F6A",
    secondaryText: "#F3C98B",
    secondaryBg: "rgba(5,8,22,0.16)",
    secondaryPressedBg: "rgba(255,255,255,0.075)",
    secondaryBorder: "rgba(230,185,118,0.14)",

    selectedBg: "rgba(230,185,118,0.11)",
    selectedBorder: "rgba(230,185,118,0.34)",
    selectedText: "#FFF8EA",

    disabledBg: "rgba(230,185,118,0.08)",
    disabledBorder: "rgba(230,185,118,0.18)",
    disabledText: "rgba(230,185,118,0.52)",

    dangerBg: "rgba(217,92,75,0.16)",
    dangerBorder: "rgba(217,92,75,0.34)",
    dangerText: "#D95C4B",

    successBg: "rgba(120,197,141,0.15)",
    successBorder: "rgba(120,197,141,0.32)",
    successText: "#78C58D",

    warningBg: "rgba(226,169,78,0.14)",
    warningBorder: "rgba(243,201,130,0.34)",
    warningText: "#F3C982",

    navActive: "#F3C98B",
    navInactive: "#8E9484",

    nearbyOwnBubbleBg: "rgba(230,185,118,0.09)",
    nearbyOwnBubbleBorder: "transparent",
    nearbyOwnBubbleMeta: "rgba(255,248,234,0.72)",
    nearbyOwnBubbleTime: "rgba(255,248,234,0.60)",

    dmOwnBubbleBg: "rgba(230,185,118,0.09)",
    dmOwnBubbleBorder: "transparent",
    dmOwnBubbleMeta: "rgba(255,248,234,0.72)",
    dmOwnBubbleTime: "rgba(255,248,234,0.60)",

    incomingBubbleBg: "transparent",
    incomingBubbleBorder: "transparent",
  },

  buttons: {
    primary: {
      minHeight: 56,
      borderRadius: 28,
      paddingHorizontal: 18,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: "700" as const,
      iconSize: 18,
      gap: 8,
    },

    secondary: {
      minHeight: 44,
      borderRadius: 17,
      paddingHorizontal: 16,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "700" as const,
      iconSize: 17,
      gap: 7,
    },

    compact: {
      minHeight: 36,
      borderRadius: 18,
      paddingHorizontal: 12,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "700" as const,
      iconSize: 16,
      gap: 6,
    },

    icon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      iconSize: 18,
    },

    chip: {
      minHeight: 36,
      borderRadius: 18,
      paddingHorizontal: 12,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "700" as const,
    },
  },

  cards: {
    radius: 22,
    innerRadius: 18,
    padding: 16,
    compactPadding: 12,
  },

  inputs: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 20,
  },
} as const;
