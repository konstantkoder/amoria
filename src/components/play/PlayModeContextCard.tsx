import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  getPlayActivityLabel,
  getPlayModeContextCardCopy,
  type PlayActivity,
  type PlayModeContextSurface,
} from "@/services/playSessions";
import { theme } from "@/theme";
import ColorMoodPaletteSummary from "@/components/play/ColorMoodPaletteSummary";

type Props = {
  activity: PlayActivity;
  promptText?: string;
  combinedPalette?: string[];
  ownPalette?: string[];
  peerPalette?: string[];
  ownTitle?: string;
  peerTitle?: string;
  compact?: boolean;
  surface?: PlayModeContextSurface;
};

export default function PlayModeContextCard({
  activity,
  promptText,
  combinedPalette,
  ownPalette,
  peerPalette,
  ownTitle,
  peerTitle,
  compact = false,
  surface = "history",
}: Props) {
  const copy = getPlayModeContextCardCopy(activity, { surface, promptText });

  if (activity === "color_mood") {
    return (
      <ColorMoodPaletteSummary
        title={copy.title}
        body={copy.body}
        combinedPalette={combinedPalette}
        ownPalette={ownPalette}
        peerPalette={peerPalette}
        ownTitle={ownTitle}
        peerTitle={peerTitle}
        emptyTitle={copy.emptyTitle}
        emptyBody={copy.emptyBody}
        compact={compact}
      />
    );
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>
        {getPlayActivityLabel(activity, "neutral")}
      </Text>
      <Text style={[styles.title, compact && styles.titleCompact]}>{copy.title}</Text>
      <Text style={[styles.body, compact && styles.bodyCompact]}>{copy.body}</Text>

      {copy.facts.length ? (
        <View style={styles.factRow}>
          {copy.facts.map((fact) => (
            <View key={`${activity}_${fact}`} style={[styles.factChip, compact && styles.factChipCompact]}>
              <Text style={[styles.factText, compact && styles.factTextCompact]}>{fact}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {copy.tagValue ? (
        <View style={[styles.tagCard, compact && styles.tagCardCompact]}>
          <Text style={[styles.tagLabel, compact && styles.tagLabelCompact]}>{copy.tagLabel}</Text>
          <Text style={[styles.tagValue, compact && styles.tagValueCompact]}>{copy.tagValue}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  cardCompact: {
    padding: 14,
    gap: 10,
    backgroundColor: "rgba(10, 14, 26, 0.82)",
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  eyebrowCompact: {
    fontSize: 11,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  titleCompact: {
    fontSize: 17,
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  bodyCompact: {
    fontSize: 13,
    lineHeight: 19,
  },
  factRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  factChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  factChipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  factText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  factTextCompact: {
    fontSize: 11,
  },
  tagCard: {
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  tagCardCompact: {
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tagLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tagLabelCompact: {
    fontSize: 10,
  },
  tagValue: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  tagValueCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
});
