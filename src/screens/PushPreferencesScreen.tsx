import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { reportClientError, sanitizeErrorForReport } from "@/services/api/clientErrorsApi";
import * as growthApi from "@/services/api/growthApi";
import { theme } from "@/theme";

const KEYS = ["messages", "together", "communityActivity", "premiumAccount"] as const;

export default function PushPreferencesScreen() {
  const { t } = useLocale();
  const [prefs, setPrefs] = React.useState<growthApi.PushPreferences | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const busyRef = React.useRef(false);

  const load = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      setPrefs(await growthApi.getPushPreferences());
    } catch (loadError) {
      const safeError = sanitizeErrorForReport(loadError);
      void reportClientError({ screen: "PushPreferences", action: "load", code: safeError.code, message: safeError.message, stack: safeError.stack });
      setError(t("pushPrefs.loadFailed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [t]);

  React.useEffect(() => { void load(); }, [load]);

  const toggle = React.useCallback(async (key: typeof KEYS[number], value: boolean) => {
    if (!prefs || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      setPrefs(await growthApi.updatePushPreferences({
        messages: next.messages,
        together: next.together,
        communityActivity: next.communityActivity,
        premiumAccount: next.premiumAccount,
      }));
    } catch (updateError) {
      const safeError = sanitizeErrorForReport(updateError);
      void reportClientError({ screen: "PushPreferences", action: "update", code: safeError.code, message: safeError.message, stack: safeError.stack });
      setPrefs(previous);
      setError(t("pushPrefs.updateFailed"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [prefs, t]);

  return (
    <ScreenShell title={t("pushPrefs.title")} showBack>
      <ScrollView contentContainerStyle={styles.content}>
        {busy && !prefs ? <ActivityIndicator color={theme.colors.accent} /> : null}
        {error ? (
          <TouchableOpacity disabled={busy} onPress={() => void load()}>
            <Text style={styles.error}>{error}</Text>
          </TouchableOpacity>
        ) : null}
        {prefs ? KEYS.map((key) => (
          <View key={key} style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.label}>{t(`pushPrefs.${key}`)}</Text>
              <Text style={styles.help}>{t(`pushPrefs.${key}.help`)}</Text>
            </View>
            <Switch disabled={busy} value={Boolean(prefs[key])} onValueChange={(value) => void toggle(key, value)} />
          </View>
        )) : null}
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.label}>{t("pushPrefs.transactional")}</Text>
            <Text style={styles.help}>{t("pushPrefs.transactional.help")}</Text>
          </View>
          <Switch value disabled />
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderSubtle },
  copy: { flex: 1, gap: 4 },
  label: { color: theme.colors.text, fontSize: 15, fontWeight: "800" },
  help: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17 },
  error: { color: "#FFD7DF", fontSize: 13, lineHeight: 18, textAlign: "center", paddingVertical: 12 },
});
