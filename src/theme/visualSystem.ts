export const visualSystem = {
  colors: {
    background: "#050816",
    backgroundRaised: "#0C1020",
    backgroundElevated: "#13182A",

    surface: "rgba(10,14,26,0.86)",
    surfaceRaised: "rgba(13,17,31,0.92)",
    surfaceSoft: "rgba(255,255,255,0.07)",
    surfacePressed: "rgba(255,255,255,0.11)",

    border: "rgba(255,255,255,0.12)",
    borderStrong: "rgba(255,255,255,0.18)",

    text: "#F9FAFF",
    textWarm: "#F6F2EC",
    textSecondary: "rgba(226,232,255,0.76)",
    textMuted: "rgba(226,232,255,0.56)",

    accent: "#DDA08B",
    accentSoft: "rgba(221,160,139,0.12)",
    accentBorder: "rgba(221,160,139,0.38)",

    primaryBg: "#C97868",
    primaryPressedBg: "#B86A5C",
    primaryText: "#1B0E12",
    primaryBorder: "#E0A18E",

    secondaryAccent: "#A78BC4",
    secondaryText: "#E9DDF3",
    secondaryBg: "rgba(167,139,196,0.12)",
    secondaryPressedBg: "rgba(167,139,196,0.20)",
    secondaryBorder: "rgba(167,139,196,0.36)",

    selectedBg: "rgba(167,139,196,0.18)",
    selectedBorder: "rgba(199,175,224,0.48)",
    selectedText: "#F6F2EC",

    disabledBg: "rgba(201,120,104,0.12)",
    disabledBorder: "rgba(201,120,104,0.28)",
    disabledText: "rgba(221,160,139,0.58)",

    dangerBg: "rgba(255,77,103,0.16)",
    dangerBorder: "rgba(255,210,218,0.30)",
    dangerText: "#FFD2DA",

    successBg: "rgba(31,185,110,0.15)",
    successBorder: "rgba(185,246,210,0.28)",
    successText: "#B9F6D2",

    warningBg: "rgba(226,169,78,0.14)",
    warningBorder: "rgba(243,201,130,0.34)",
    warningText: "#F3C982",

    navActive: "#F6F2EC",
    navInactive: "#8E94B4",

    nearbyOwnBubbleBg: "#3A233A",
    nearbyOwnBubbleBorder: "#A77A9D",
    nearbyOwnBubbleMeta: "rgba(233,221,243,0.72)",
    nearbyOwnBubbleTime: "rgba(233,221,243,0.60)",

    dmOwnBubbleBg: "#2F2A4A",
    dmOwnBubbleBorder: "#8D7AC5",
    dmOwnBubbleMeta: "rgba(233,221,243,0.72)",
    dmOwnBubbleTime: "rgba(233,221,243,0.60)",

    incomingBubbleBg: "rgba(12,16,30,0.88)",
    incomingBubbleBorder: "rgba(255,255,255,0.10)",
  },

  buttons: {
    primary: {
      minHeight: 48,
      borderRadius: 18,
      paddingHorizontal: 18,
      fontSize: 15,
      lineHeight: 18,
      fontWeight: "900" as const,
      iconSize: 18,
      gap: 8,
    },

    secondary: {
      minHeight: 44,
      borderRadius: 17,
      paddingHorizontal: 16,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "900" as const,
      iconSize: 17,
      gap: 7,
    },

    compact: {
      minHeight: 36,
      borderRadius: 18,
      paddingHorizontal: 12,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900" as const,
      iconSize: 16,
      gap: 6,
    },

    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      iconSize: 18,
    },

    chip: {
      minHeight: 36,
      borderRadius: 18,
      paddingHorizontal: 12,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900" as const,
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
