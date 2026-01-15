import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { theme } from "@/theme";
import {
  getAdultOk,
  setAdultOk,
  getFlirtEnabled,
  setFlirtEnabled,
} from "@/services/moderation";
import { setAdultConsent, setFlirtEnabledRemote } from "@/services/firebase";
import { useLocale } from "@/contexts/LocaleContext";

export default function FlirtSettingsScreen() {
  const { t } = useLocale();
  const [adult, setAdult] = useState(false);
  const [flirt, setFlirt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const adultOk = await getAdultOk();
      const flirtFlag = await getFlirtEnabled();
      if (!mounted) return;
      setAdult(adultOk);
      setFlirt(flirtFlag);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    try {
      setBusy(true);
      await setAdultOk(adult);
      const allowFlirt = adult && flirt;
      await setFlirtEnabled(allowFlirt);
      await setAdultConsent(adult);
      await setFlirtEnabledRemote(allowFlirt);
      Alert.alert(t("common.done"), t("flirt.saveSuccessBody"));
    } catch (e: any) {
      Alert.alert(
        t("common.error"),
        e?.message ?? t("flirt.saveErrorBody"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: theme.colors.text,
          marginBottom: 8,
        }}
      >
        {t("flirt.title")}
      </Text>
      <Text style={{ color: "#333", marginBottom: 12 }}>
        {t("flirt.description")}
      </Text>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          {t("flirt.ageConfirmTitle")}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text>{t("flirt.ageConfirmLabel")}</Text>
          <Switch value={adult} onValueChange={setAdult} />
        </View>
      </View>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
          opacity: adult ? 1 : 0.5,
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          {t("flirt.enableTitle")}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text>{t("flirt.enableDescription")}</Text>
          <Switch
            value={flirt && adult}
            onValueChange={setFlirt}
            disabled={!adult}
          />
        </View>
      </View>
      <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 14 }}>
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          {t("flirt.rulesTitle")}
        </Text>
        <Text style={{ color: "#333" }}>{t("flirt.rulesBody")}</Text>
      </View>
      <TouchableOpacity
        disabled={busy}
        onPress={save}
        style={{
          marginTop: 16,
          backgroundColor: theme.colors.primary,
          borderRadius: 12,
          padding: 14,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "800" }}>
          {busy ? t("common.saving") : t("common.save")}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
