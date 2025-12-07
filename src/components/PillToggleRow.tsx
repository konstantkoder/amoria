import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

import { theme } from "@/theme";

export interface PillOption {
  id: string;
  label: string;
  badge?: string;
}

export interface PillToggleRowProps {
  title?: string;
  options: PillOption[];
  selectedId: string;
  onChange: (id: string) => void;
  style?: ViewStyle;
}

const PillToggleRow: React.FC<PillToggleRowProps> = ({
  title,
  options,
  selectedId,
  onChange,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => {
          const active = option.id === selectedId;
          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.85}
              onPress={() => onChange(option.id)}
              style={[
                styles.pill,
                {
                  backgroundColor: active
                    ? theme.colors.accent
                    : "rgba(148, 163, 184, 0.18)",
                },
              ]}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: active
                      ? theme.colors.background
                      : theme.colors.subtext,
                  },
                ]}
              >
                {option.label}
              </Text>
              {option.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{option.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.subtext,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  badge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.text,
  },
});

export default PillToggleRow;
