import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  getPlayColorMoodOption,
  type PlayColorMoodOption,
} from "@/services/playSessions";
import { theme } from "@/theme";

type Props = {
  title: string;
  body?: string;
  combinedPalette?: string[];
  ownPalette?: string[];
  peerPalette?: string[];
  ownTitle?: string;
  peerTitle?: string;
  emptyTitle?: string;
  emptyBody?: string;
  compact?: boolean;
};

function resolvePaletteOption(hex: string): PlayColorMoodOption | null {
  return getPlayColorMoodOption(hex);
}

function PaletteChip({ hex, compact = false }: { hex: string; compact?: boolean }) {
  const option = resolvePaletteOption(hex);
  const label = option?.label ?? hex;

  return (
    <View style={[styles.chip, compact && styles.chipCompact]}>
      <View style={[styles.dot, { backgroundColor: option?.hex ?? hex }]} />
      <Text style={[styles.chipText, compact && styles.chipTextCompact]}>{label}</Text>
    </View>
  );
}

function PaletteSection({
  title,
  palette,
  emptyText,
  compact = false,
}: {
  title: string;
  palette: string[];
  emptyText: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{title}</Text>
      {palette.length ? (
        <View style={styles.chipRow}>
          {palette.map((hex) => (
            <PaletteChip key={`${title}_${hex}`} hex={hex} compact={compact} />
          ))}
        </View>
      ) : (
        <Text style={[styles.emptyText, compact && styles.emptyTextCompact]}>{emptyText}</Text>
      )}
    </View>
  );
}

export default function ColorMoodPaletteSummary({
  title,
  body,
  combinedPalette = [],
  ownPalette,
  peerPalette,
  ownTitle = "Твои цвета",
  peerTitle = "Цвета второго участника",
  emptyTitle = "Цвета уже собраны не полностью",
  emptyBody = "Палитра сохранилась, но часть цветового выбора не успела дойти до итога.",
  compact = false,
}: Props) {
  const compositionColors = combinedPalette.length
    ? combinedPalette
    : [theme.colors.primary, theme.colors.accent, "#C8A9FF"];

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {body ? <Text style={[styles.body, compact && styles.bodyCompact]}>{body}</Text> : null}

      <View style={[styles.compositionShell, compact && styles.compositionShellCompact]}>
        <View style={[styles.compositionOrb, { backgroundColor: compositionColors[0] ?? theme.colors.primary }]} />
        <View
          style={[
            styles.compositionOrb,
            styles.compositionOrbCenter,
            { backgroundColor: compositionColors[1] ?? theme.colors.accent },
          ]}
        />
        <View
          style={[
            styles.compositionOrb,
            styles.compositionOrbRight,
            { backgroundColor: compositionColors[2] ?? "#C8A9FF" },
          ]}
        />
        {compositionColors[3] ? (
          <View
            style={[
              styles.compositionOrbSmall,
              styles.compositionOrbSmallLeft,
              { backgroundColor: compositionColors[3] },
            ]}
          />
        ) : null}
        {compositionColors[4] ? (
          <View
            style={[
              styles.compositionOrbSmall,
              styles.compositionOrbSmallRight,
              { backgroundColor: compositionColors[4] },
            ]}
          />
        ) : null}
      </View>

      {combinedPalette.length ? (
        <PaletteSection
          title="Ваша общая палитра"
          palette={combinedPalette}
          emptyText={emptyBody}
          compact={compact}
        />
      ) : (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{emptyTitle}</Text>
          <Text style={[styles.emptyText, compact && styles.emptyTextCompact]}>{emptyBody}</Text>
        </View>
      )}

      {ownPalette ? (
        <PaletteSection
          title={ownTitle}
          palette={ownPalette}
          emptyText="Твой выбор еще не закрепился."
          compact={compact}
        />
      ) : null}
      {peerPalette ? (
        <PaletteSection
          title={peerTitle}
          palette={peerPalette}
          emptyText="Выбор второго участника еще не закрепился."
          compact={compact}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(16, 20, 38, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 14,
  },
  cardCompact: {
    padding: 14,
    gap: 12,
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
  compositionShell: {
    height: 156,
    borderRadius: theme.shapes.cardInner,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  compositionShellCompact: {
    height: 128,
  },
  compositionOrb: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
    top: 20,
    left: 22,
    opacity: 0.78,
  },
  compositionOrbCenter: {
    width: 134,
    height: 134,
    borderRadius: 67,
    top: 12,
    left: "36%",
  },
  compositionOrbRight: {
    width: 110,
    height: 110,
    borderRadius: 55,
    top: 34,
    right: 24,
    left: undefined,
    opacity: 0.72,
  },
  compositionOrbSmall: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    opacity: 0.82,
  },
  compositionOrbSmallLeft: {
    left: 28,
    bottom: 18,
  },
  compositionOrbSmallRight: {
    right: 28,
    top: 18,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  sectionTitleCompact: {
    fontSize: 13,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  chipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextCompact: {
    fontSize: 12,
  },
  emptyText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyTextCompact: {
    fontSize: 12,
    lineHeight: 18,
  },
});
