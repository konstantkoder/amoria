import React from "react";
import { View, Text } from "react-native";

export default function CompatibilityChip({ score }: { score: number }) {
  const safeScore = Math.min(100, Math.max(0, Math.round(score)));
  return (
    <View
      style={{
        position: "absolute",
        left: 10,
        top: 10,
        backgroundColor: "rgba(124, 219, 138, 0.18)",
        borderColor: "rgba(124,219,138,0.9)",
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
      }}
    >
      <Text style={{ color: "#1c7c3f", fontWeight: "700" }}>
        Match {safeScore}%
      </Text>
    </View>
  );
}
