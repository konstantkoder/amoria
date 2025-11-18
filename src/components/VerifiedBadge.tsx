import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function VerifiedBadge() {
  return (
    <View
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        backgroundColor: "rgba(0,0,0,0.45)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Ionicons name="checkmark-circle" size={16} color="#7CDB8A" />
      <Text style={{ color: "#fff", marginLeft: 6, fontWeight: "600" }}>
        Verified
      </Text>
    </View>
  );
}
