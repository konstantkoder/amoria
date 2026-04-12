// NOTE: Modified version of ProfileScreen. This update sets a dedicated
// profile background and tweaks overlay/blur to keep the image bright while
// preserving text readability.

import React from "react";
import { View, Text, Button } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenBackground from "@/components/ScreenBackground";
import { useLocale } from "@/contexts/LocaleContext";
import type { ProfileStackParamList } from "@/navigation/appRoutes";

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, "ProfileMain">;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const { t } = useLocale();
  return (
    <ScreenBackground
      variant="profile"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
          {t("screen.profile")}
        </Text>
        <Button
          title={t("profile.edit")}
          onPress={() => navigation.navigate("EditProfile")}
        />
        <View style={{ height: 8 }} />
        <Button
          title={t("profile.photos")}
          onPress={() => navigation.navigate("PhotoManager")}
        />
        <View style={{ height: 8 }} />
        <Button
          title={t("profile.flirt18")}
          onPress={() => navigation.navigate("FlirtSettings")}
        />
      </View>
    </ScreenBackground>
  );
}
