import React from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import type { Goal, Mood, UserProfile } from "@/models/User";
import type { ProfileStackParamList } from "@/navigation/appRoutes";
import { getUserProfile } from "@/services/user";
import { theme } from "@/theme";

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, "ProfileMain">;

const GOAL_LABEL_KEYS: Record<Goal, string> = {
  dating: "profile.goal.dating",
  friends: "profile.goal.friends",
  chat: "profile.goal.chat",
  long_term: "profile.goal.long_term",
  short_term: "profile.goal.short_term",
  casual: "profile.goal.casual",
  sex: "profile.goal.sex",
};

const MOOD_LABEL_KEYS: Record<Mood, string> = {
  happy: "profile.mood.happy",
  chill: "profile.mood.chill",
  active: "profile.mood.active",
  serious: "profile.mood.serious",
  party: "profile.mood.party",
};

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const { t } = useLocale();
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);

      void getUserProfile()
        .then((nextProfile) => {
          if (!active) return;
          setProfile(nextProfile);
        })
        .catch(() => {
          if (active) {
            setProfile(null);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [])
  );

  const photos = profile?.photos ?? [];
  const goalLabel = profile?.goal ? t(GOAL_LABEL_KEYS[profile.goal]) : t("profile.goal.unknown");
  const moodLabel = profile?.mood ? t(MOOD_LABEL_KEYS[profile.mood]) : t("profile.mood.unknown");
  const about = profile?.about?.trim() ? profile.about : t("profile.noDescription");

  if (loading) {
    return (
      <ScreenShell title={t("screen.profile")} background="profile" overlayOpacity={0.16}>
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>{t("editProfile.loading")}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t("screen.profile")} background="profile" overlayOpacity={0.16}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          {photos[0] ? (
            <Image source={{ uri: photos[0] }} style={styles.heroPhoto} />
          ) : (
            <View style={[styles.heroPhoto, styles.heroPhotoFallback]}>
              <Text style={styles.heroFallbackText}>{t("photos.empty")}</Text>
            </View>
          )}
          <Text style={styles.displayName}>{profile?.displayName || t("common.user")}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{goalLabel}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{moodLabel}</Text>
            </View>
            {profile?.allowAdultMode ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("common.adultShort")}</Text>
              </View>
            ) : null}
            {profile?.mysteryMode ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("profile.mysteryBadge")}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.about}>{about}</Text>
          {profile?.interests?.length ? (
            <View style={styles.interests}>
              {profile.interests.map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.86}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Text style={styles.actionButtonText}>{t("profile.edit")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.86}
            onPress={() => navigation.navigate("PhotoManager")}
          >
            <Text style={styles.actionButtonText}>{t("profile.photos")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.86}
            onPress={() => navigation.navigate("FlirtSettings")}
          >
            <Text style={styles.actionButtonText}>{t("profile.flirt18")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.galleryCard}>
          {photos.length ? (
            <View style={styles.galleryGrid}>
              {photos.map((photo, index) => (
                <Image key={`${photo}-${index}`} source={{ uri: photo }} style={styles.galleryPhoto} />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyPhotos}>{t("photos.empty")}</Text>
          )}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 28,
    gap: 16,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loaderText: {
    color: theme.colors.subtext,
  },
  heroCard: {
    backgroundColor: "rgba(8, 12, 24, 0.74)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 14,
  },
  heroPhoto: {
    width: "100%",
    aspectRatio: 1.12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroPhotoFallback: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  heroFallbackText: {
    color: theme.colors.subtext,
    textAlign: "center",
  },
  displayName: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  about: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  interests: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255, 78, 138, 0.16)",
  },
  interestText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    gap: 10,
  },
  actionButton: {
    backgroundColor: "rgba(8, 12, 24, 0.82)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  galleryCard: {
    backgroundColor: "rgba(8, 12, 24, 0.74)",
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  galleryPhoto: {
    width: "48.2%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  emptyPhotos: {
    color: theme.colors.subtext,
    textAlign: "center",
    paddingVertical: 28,
  },
});
