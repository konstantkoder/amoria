import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import PremiumGoldButton from "@/components/PremiumGoldButton";
import { theme } from "@/theme";

type Action = {
  label: string;
  onPress: () => void;
};

type Props = {
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  primaryAction?: Action;
  secondaryAction?: Action;
  children?: React.ReactNode;
};

export default function CoreStateCard({
  title,
  body,
  icon = "sparkles-outline",
  loading = false,
  primaryAction,
  secondaryAction,
  children,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        {loading ? (
          <ActivityIndicator color={theme.colors.textAccent} />
        ) : (
          <Ionicons name={icon} size={30} color={theme.colors.textAccent} />
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {children}

      {primaryAction || secondaryAction ? (
        <View style={styles.actions}>
          {primaryAction ? (
            <PremiumGoldButton label={primaryAction.label} onPress={primaryAction.onPress} />
          ) : null}
          {secondaryAction ? (
            <Pressable onPress={secondaryAction.onPress} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 540,
    borderRadius: theme.cards.standard.borderRadius,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: theme.cards.standard.backgroundColor,
    borderWidth: theme.cards.standard.borderWidth,
    borderColor: theme.cards.standard.borderColor,
    alignItems: "center",
    gap: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceWarm,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 420,
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    minHeight: theme.buttons.secondary.height,
    borderRadius: theme.buttons.secondary.borderRadius,
    paddingHorizontal: theme.buttons.secondary.paddingHorizontal,
    paddingVertical: 13,
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: theme.buttons.secondary.borderWidth,
    borderColor: theme.buttons.secondary.borderColor,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.buttons.secondary.textColor,
    fontSize: theme.buttons.secondary.fontSize,
    lineHeight: theme.buttons.secondary.lineHeight,
    fontWeight: theme.buttons.secondary.fontWeight,
  },
});
