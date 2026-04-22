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
    maxWidth: 540,
    borderRadius: theme.shapes.card,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: "rgba(15, 18, 34, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    backgroundColor: "rgba(255, 122, 60, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.26)",
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
  primaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: "rgba(255,255,255,0.04)",
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
