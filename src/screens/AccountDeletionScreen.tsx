import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ApiError } from "@/services/api/apiClient";
import { theme } from "@/theme";

const CONFIRMATION = "DELETE";

export default function AccountDeletionScreen() {
  const auth = useAuth();
  const { t } = useLocale();
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const inFlight = React.useRef(false);
  const confirmed = confirmation.trim().toUpperCase() === CONFIRMATION && password.length > 0;

  const submit = React.useCallback(async () => {
    if (!confirmed || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      await auth.deleteAccount(password);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "invalid_credentials") setError(t("accountDeletion.wrongPassword"));
      else if (cause instanceof ApiError && cause.code === "active_admin_user") setError(t("accountDeletion.adminBlocked"));
      else setError(t("accountDeletion.failed"));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [auth, confirmed, password, t]);

  return (
    <ScreenShell title={t("accountDeletion.title")} background="profileArchGardenV6" showBack>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>{t("accountDeletion.warningTitle")}</Text>
            <Text style={styles.body}>{t("accountDeletion.warningBody")}</Text>
          </View>
          <Text style={styles.label}>{t("accountDeletion.passwordLabel")}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            placeholder={t("accountDeletion.passwordPlaceholder")}
            placeholderTextColor="rgba(229,231,235,0.42)"
            style={styles.input}
          />
          <Text style={styles.label}>{t("accountDeletion.confirmLabel")}</Text>
          <TextInput
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting}
            placeholder={CONFIRMATION}
            placeholderTextColor="rgba(229,231,235,0.42)"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            disabled={!confirmed || submitting}
            onPress={() => void submit()}
            style={[styles.deleteButton, (!confirmed || submitting) ? styles.disabled : null]}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteButtonText}>{t("accountDeletion.confirmAction")}</Text>}
          </TouchableOpacity>
          <Text style={styles.note}>{t("accountDeletion.processingNote")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 6, paddingTop: 10, paddingBottom: 36, gap: 12 },
  warning: { borderRadius: 16, padding: 15, backgroundColor: "rgba(120,20,40,0.22)", borderWidth: 1, borderColor: "rgba(255,125,150,0.38)", gap: 7 },
  warningTitle: { color: "#FFD7DF", fontSize: 17, fontWeight: "900" },
  body: { color: "rgba(255,235,239,0.82)", fontSize: 13, lineHeight: 19 },
  label: { color: "#F4E8D1", fontSize: 13, fontWeight: "800", marginTop: 5 },
  input: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "rgba(5,8,22,0.7)", borderWidth: 1, borderColor: "rgba(230,185,118,0.22)", color: "#FFFFFF", fontSize: 15 },
  error: { color: "#FF9CAD", fontSize: 13, lineHeight: 18 },
  deleteButton: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#B62846", marginTop: 4 },
  disabled: { opacity: 0.42 },
  deleteButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  note: { color: "rgba(229,231,235,0.6)", fontSize: 12, lineHeight: 17 },
});
