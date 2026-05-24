import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  getPublicMediaUrlInfo,
  type PublicMediaUrlInfo,
} from "@/services/media/mediaUrl";
import { theme } from "@/theme";

type Props = {
  avatarUrl?: string;
  label?: string;
  size?: number;
  onLoadError?: (info: PublicMediaUrlInfo) => void;
};

function normalizeAvatarUrl(value?: string) {
  return getPublicMediaUrlInfo(value, "avatar URL");
}

function getInitials(label?: string) {
  const parts = String(label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function UserAvatar({ avatarUrl, label, size = 44, onLoadError }: Props) {
  const [failed, setFailed] = React.useState(false);
  const urlInfo = normalizeAvatarUrl(avatarUrl);
  const sharedUrl = urlInfo.url ?? "";
  const initials = getInitials(label);

  React.useEffect(() => {
    setFailed(false);
  }, [sharedUrl]);

  if (sharedUrl && !failed) {
    return (
      <Image
        source={{ uri: sharedUrl }}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        onError={() => {
          setFailed(true);
          onLoadError?.(urlInfo);
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      {initials ? (
        <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.34) }]}>
          {initials}
        </Text>
      ) : (
        <Ionicons name="person-outline" size={Math.max(16, size * 0.46)} color={theme.colors.text} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: theme.colors.text,
    fontWeight: "800",
  },
});
