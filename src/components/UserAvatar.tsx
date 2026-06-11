import React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
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
  cacheKey?: string | number;
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

function withCacheKey(url: string, cacheKey?: string | number) {
  const stableKey = String(cacheKey ?? "").trim();
  if (!stableKey) return url;

  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("v", stableKey);
    return nextUrl.toString();
  } catch {
    return url;
  }
}

export default function UserAvatar({
  avatarUrl,
  label,
  size = 44,
  cacheKey,
  onLoadError,
}: Props) {
  const [failed, setFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const urlInfo = React.useMemo(() => normalizeAvatarUrl(avatarUrl), [avatarUrl]);
  const sharedUrl = urlInfo.url ?? "";
  const imageUrl = React.useMemo(
    () => (sharedUrl ? withCacheKey(sharedUrl, cacheKey) : ""),
    [cacheKey, sharedUrl]
  );
  const hasRawAvatarUrl = Boolean(String(avatarUrl ?? "").trim());
  const initials = getInitials(label);

  React.useEffect(() => {
    setFailed(false);
    setLoading(Boolean(imageUrl));
  }, [imageUrl]);

  React.useEffect(() => {
    if (hasRawAvatarUrl && !sharedUrl) {
      onLoadError?.(urlInfo);
    }
  }, [hasRawAvatarUrl, onLoadError, sharedUrl, urlInfo]);

  if (imageUrl && !failed) {
    return (
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Image
          key={imageUrl}
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setFailed(true);
            setLoading(false);
            onLoadError?.(urlInfo);
          }}
        />
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={theme.colors.text} size="small" />
          </View>
        ) : null}
      </View>
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
    overflow: "hidden",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  initials: {
    color: theme.colors.text,
    fontWeight: "800",
  },
});
