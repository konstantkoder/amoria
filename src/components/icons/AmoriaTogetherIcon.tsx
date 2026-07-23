import React from "react";
import { Image, StyleSheet, type ImageStyle, type StyleProp } from "react-native";

const activeSource = require("../../../assets/icons/amoria_tab_icon_active_512.png");
const inactiveSource = require("../../../assets/icons/amoria_tab_icon_inactive_512.png");

type AmoriaTogetherIconProps = {
  size?: number;
  active?: boolean;
  color?: string;
  style?: StyleProp<ImageStyle>;
};

export function AmoriaTogetherIcon({
  size = 24,
  active = true,
  color,
  style,
}: AmoriaTogetherIconProps) {
  return (
    <Image
      source={active ? activeSource : inactiveSource}
      resizeMode="contain"
      style={[styles.icon, { width: size, height: size, tintColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
});
