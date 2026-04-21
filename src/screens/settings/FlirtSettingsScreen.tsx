import React from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";
import { getUserProfile, updateFlirtSettings } from "@/services/user";

export default function FlirtSettingsScreen() {
  const { t } = useLocale();
  const [adult, setAdult] = React.useState(false);
  const [flirt, setFlirt] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);

      void getUserProfile()
        .then((profile) => {
          if (!active) return;
          setAdult(profile.allowAdultMode ?? false);
          setFlirt(profile.flirtEnabled ?? false);
        })
        .catch(() => {
          if (active) {
            Alert.alert(t("common.error"), t("editProfile.loadErrorBody"));
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
    }, [t])
  );

  const save = async () => {
    try {
      setBusy(true);
      const profile = await updateFlirtSettings(adult, adult && flirt);
      setAdult(profile.allowAdultMode ?? false);
      setFlirt(profile.flirtEnabled ?? false);
      Alert.alert(t("common.done"), t("flirt.saveSuccessBody"));
    } catch (error: any) {
      Alert.alert(t("common.error"), error?.message ?? t("flirt.saveErrorBody"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell
        title={t("profile.flirt18")}
        background="profile"
        overlayOpacity={0.16}
        showBack
      >
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>{t("editProfile.loading")}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("profile.flirt18")}
      background="profile"
      overlayOpacity={0.16}
      showBack
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{t("flirt.title")}</Text>
          <Text style={styles.description}>{t("flirt.description")}</Text>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t("flirt.ageConfirmTitle")}</Text>
            <View style={styles.row}>
              <Text style={styles.rowText}>{t("flirt.ageConfirmLabel")}</Text>
              <Switch value={adult} onValueChange={setAdult} />
            </View>
          </View>

          <View style={[styles.sectionCard, !adult ? styles.sectionCardDisabled : null]}>
            <Text style={styles.sectionTitle}>{t("flirt.enableTitle")}</Text>
            <View style={styles.row}>
              <Text style={styles.rowText}>{t("flirt.enableDescription")}</Text>
              <Switch
                value={flirt && adult}
                onValueChange={setFlirt}
                disabled={!adult}
              />
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t("flirt.rulesTitle")}</Text>
            <Text style={styles.rulesText}>{t("flirt.rulesBody")}</Text>
          </View>

          <TouchableOpacity
            disabled={busy}
            onPress={() => void save()}
            style={[styles.saveButton, busy ? styles.saveButtonDisabled : null]}
          >
            <Text style={styles.saveButtonText}>
              {busy ? t("common.saving") : t("common.save")}
            </Text>
          </TouchableOpacity>
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
    paddingBottom: 32,
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
  card: {
    backgroundColor: "rgba(8, 12, 24, 0.8)",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 8,
  },
  description: {
    color: theme.colors.subtext,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  sectionCardDisabled: {
    opacity: 0.5,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 8,
    color: theme.colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowText: {
    color: theme.colors.text,
    flex: 1,
  },
  rulesText: {
    color: theme.colors.subtext,
  },
  saveButton: {
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 14,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "800",
  },
});
