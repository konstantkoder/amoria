import React from "react";
import { View, Text, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import VerifiedBadge from "./VerifiedBadge";
import CompatibilityChip from "./CompatibilityChip";
import { overlap, topShared } from "@/utils/compat";

const { width } = Dimensions.get("window");
const CARD_W = width - 32;
const CARD_H = Math.round(CARD_W * 1.25);

type Profile = {
  id?: string;
  name?: string;
  age?: number;
  bio?: string;
  interests?: string[];
  photos?: string[];
  verified?: boolean;
};

type Props = {
  profile: Profile;
  currentInterests?: string[];
};

export default function ProfileCard({ profile, currentInterests }: Props) {
  const photo = profile.photos?.[0];
  const score = overlap(currentInterests, profile.interests);
  const shared = topShared(currentInterests, profile.interests);
  const initial = (profile.name?.[0] || "A").toUpperCase();

  return (
    <View
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 24,
        overflow: "hidden",
        alignSelf: "center",
        backgroundColor: "#eee",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 6,
      }}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={["#7C4DFF", "#AA00FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 160, color: "white", fontWeight: "800" }}>
            {initial}
          </Text>
        </LinearGradient>
      )}

      <CompatibilityChip score={score} />
      {profile.verified ? <VerifiedBadge /> : null}

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.7)"]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          paddingTop: 48,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800" }}>
          {profile.name || "User"}
          {profile.age ? `, ${profile.age}` : ""}
        </Text>

        {shared.length > 0 && (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}
          >
            {shared.map((tag, i) => (
              <View
                key={`${tag}-${i}`}
                style={{
                  backgroundColor: "rgba(255,255,255,0.14)",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 12,
                  marginRight: 8,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {!!profile.bio && (
          <Text numberOfLines={2} style={{ color: "#eee", marginTop: 6 }}>
            {profile.bio}
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}
