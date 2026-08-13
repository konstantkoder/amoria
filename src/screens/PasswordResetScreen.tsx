import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useLocale } from "@/contexts/LocaleContext";
import { ApiError } from "@/services/api/apiClient";
import { confirmPasswordReset, requestPasswordReset } from "@/services/api/authApi";
import { theme } from "@/theme";

type Stage = "email" | "confirm" | "success";
type Props = { initialEmail?: string; onBack: (email: string) => void };

function resetErrorKey(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "invalid_password_reset_code") return "auth.reset.invalidCode";
  if (code === "password_reset_code_expired") return "auth.reset.expiredCode";
  if (code === "password_reset_attempts_exceeded" || code === "rate_limited" || code === "resend_cooldown") {
    return "auth.rateLimited";
  }
  if (code === "email_delivery_unavailable") return "auth.emailDeliveryUnavailable";
  return "auth.networkError";
}

export default function PasswordResetScreen({ initialEmail = "", onBack }: Props) {
  const { locale, t } = useLocale();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mutationInFlightRef = useRef(false);

  const requestCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || busy || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      await requestPasswordReset({ email: email.trim(), locale });
      setStage("confirm");
    } catch (error) {
      setErrorKey(resetErrorKey(error));
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (code.length !== 6 || newPassword.length < 8 || busy || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      await confirmPasswordReset({ email: email.trim(), code, newPassword });
      setCode("");
      setNewPassword("");
      setStage("success");
    } catch (error) {
      setErrorKey(resetErrorKey(error));
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.backButton} onPress={() => onBack(email.trim())} accessibilityRole="button">
        <Ionicons name="chevron-back" size={24} color={theme.colors.goldBright} />
      </TouchableOpacity>
      <Text style={styles.title}>{t("auth.reset.title")}</Text>
      {stage === "email" ? (
        <>
          <Text style={styles.body}>{t("auth.reset.emailExplanation")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t("auth.emailPlaceholder")}
            placeholderTextColor="rgba(226,232,255,0.42)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <ActionButton busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} label={t("auth.reset.sendCode")} onPress={requestCode} />
        </>
      ) : stage === "confirm" ? (
        <>
          <Text style={styles.body}>{t("auth.reset.genericRequest")}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("auth.verification.codePlaceholder")}
            placeholderTextColor="rgba(226,232,255,0.42)"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
          />
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t("auth.reset.newPassword")}
            placeholderTextColor="rgba(226,232,255,0.42)"
            secureTextEntry
            autoComplete="new-password"
          />
          <Text style={styles.hint}>{t("auth.passwordHint")}</Text>
          <ActionButton busy={busy} disabled={code.length !== 6 || newPassword.length < 8} label={t("auth.reset.confirm")} onPress={confirm} />
        </>
      ) : (
        <>
          <Ionicons name="checkmark-circle" size={58} color={theme.colors.goldBright} style={styles.successIcon} />
          <Text style={styles.body}>{t("auth.reset.success")}</Text>
          <ActionButton busy={false} disabled={false} label={t("auth.reset.backToLogin")} onPress={() => onBack(email.trim())} />
        </>
      )}
      {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}
    </View>
  );
}

function ActionButton(props: { busy: boolean; disabled: boolean; label: string; onPress: () => void | Promise<void> }) {
  const disabled = props.busy || props.disabled;
  return (
    <TouchableOpacity style={[styles.button, disabled ? styles.disabled : null]} disabled={disabled} onPress={() => void props.onPress()} accessibilityRole="button">
      {props.busy ? <ActivityIndicator color={theme.colors.primaryActionText} /> : <Text style={styles.buttonText}>{props.label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: theme.colors.textPrimary, fontFamily: "serif", fontSize: 31, lineHeight: 38, textAlign: "center", marginTop: 8 },
  body: { color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 12, marginBottom: 12 },
  input: { minHeight: 52, borderWidth: 1, borderColor: "rgba(230,185,118,0.18)", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)", color: theme.colors.textPrimary, paddingHorizontal: 14, marginTop: 10, fontSize: 15 },
  codeInput: { textAlign: "center", fontSize: 24, fontWeight: "700", letterSpacing: 8 },
  hint: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 8 },
  button: { minHeight: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: 18, backgroundColor: theme.colors.primaryActionBg },
  disabled: { opacity: 0.45 },
  buttonText: { color: theme.colors.primaryActionText, fontSize: 16, fontWeight: "800" },
  error: { color: theme.colors.dangerText, textAlign: "center", fontSize: 13, marginTop: 12 },
  successIcon: { alignSelf: "center", marginTop: 22 },
});
