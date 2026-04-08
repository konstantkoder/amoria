import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
          <ActivityIndicator color={theme.colors.accent} />
        ) : (
          <Ionicons name={icon} size={30} color={theme.colors.accent} />
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {children}

      {primaryAction || secondaryAction ? (
        <View style={styles.actions}>
          {primaryAction ? (
            <Pressable onPress={primaryAction.onPress} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{primaryAction.label}</Text>
            </Pressable>
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
    borderRadius: theme.shapes.card,
    padding: 22,
    backgroundColor: "rgba(17, 20, 36, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
