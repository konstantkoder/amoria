// FILE: src/components/ScreenBackground.tsx
import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  children: React.ReactNode;
};

export default function ScreenBackground({ children }: Props) {
  return (
    <LinearGradient
      // мягкий тёмный градиент: сверху чуть светлее, снизу темнее
      colors={["#020617", "#02091b", "#020b27"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },
});

