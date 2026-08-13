import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ApiError } from "@/services/api/apiClient";
import { resendVerification } from "@/services/api/authApi";
import { theme } from "@/theme";

type Props = {
  email: string;
  initialCooldownSec?: number;
  onChangeEmail: () => void;
};

function verificationErrorKey(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "verification_code_expired") return "auth.verification.expired";
  if (code === "verification_attempts_exceeded" || code === "rate_limited") {
    return "auth.rateLimited";
  }
  if (code === "email_delivery_unavailable") return "auth.emailDeliveryUnavailable";
  if (code === "invalid_verification_code" || code === "validation_error") {
    return "auth.verification.invalidCode";
  }
  return "auth.networkError";
}

export default function EmailVerificationScreen({
  email,
  initialCooldownSec = 0,
  onChangeEmail,
}: Props) {
  const auth = useAuth();
  const { locale, t } = useLocale();
  const codeInputRef = useRef<TextInput>(null);
  const mutationInFlightRef = useRef(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(initialCooldownSec);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => setCooldownSec((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldownSec > 0]);

  const canVerify = code.length === 6 && !busy && !resending;
  const explanation = useMemo(
    () => t("auth.verification.explanation", { email }),
    [email, t]
  );

  const verify = async () => {
    if (!canVerify || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      await auth.verifyEmail({ email, code });
      setCode("");
      Keyboard.dismiss();
    } catch (error) {
      setErrorKey(verificationErrorKey(error));
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldownSec > 0 || busy || resending || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    setResending(true);
    setErrorKey(null);
    try {
      const response = await resendVerification({ email, locale });
      setCooldownSec(response.resendAfterSec);
      setCode("");
      codeInputRef.current?.focus();
    } catch (error) {
      if (error instanceof ApiError && error.fields?.retryAfterSec) {
        setCooldownSec(Number(error.fields.retryAfterSec) || 0);
      }
      setErrorKey(verificationErrorKey(error));
    } finally {
      mutationInFlightRef.current = false;
      setResending(false);
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("auth.verification.changeEmail")}
        style={styles.backButton}
        onPress={onChangeEmail}
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.goldBright} />
      </TouchableOpacity>
      <Text style={styles.kicker}>AMORIA</Text>
      <Text style={styles.title}>{t("auth.verification.title")}</Text>
      <Text style={styles.body}>{explanation}</Text>
      <TextInput
        ref={codeInputRef}
        style={styles.codeInput}
        value={code}
        onChangeText={(value) => {
          setCode(value.replace(/\D/g, "").slice(0, 6));
          setErrorKey(null);
        }}
        placeholder={t("auth.verification.codePlaceholder")}
        placeholderTextColor="rgba(226,232,255,0.42)"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        editable={!busy}
        onSubmitEditing={() => void verify()}
      />
      {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}
      <TouchableOpacity
        style={[styles.primaryButton, !canVerify ? styles.disabled : null]}
        onPress={() => void verify()}
        disabled={!canVerify}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={theme.colors.primaryActionText} /> : (
          <Text style={styles.primaryText}>{t("auth.verification.verify")}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => void resend()}
        disabled={cooldownSec > 0 || busy || resending}
        accessibilityRole="button"
      >
        <Text style={[styles.secondaryText, cooldownSec > 0 ? styles.secondaryDisabled : null]}>
          {resending
            ? t("auth.verification.resending")
            : cooldownSec > 0
              ? t("auth.verification.resendCooldown", { seconds: String(cooldownSec) })
              : t("auth.verification.resend")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.changeButton} onPress={onChangeEmail} accessibilityRole="button">
        <Text style={styles.changeText}>{t("auth.verification.changeEmail")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  kicker: { color: theme.colors.gold, fontSize: 11, letterSpacing: 3, textAlign: "center", fontWeight: "800" },
  title: { color: theme.colors.textPrimary, fontFamily: "serif", fontSize: 31, lineHeight: 38, textAlign: "center", marginTop: 10 },
  body: { color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 12 },
  codeInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: "rgba(230,185,118,0.28)",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.055)",
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 14,
  },
  error: { color: theme.colors.dangerText, textAlign: "center", fontSize: 13, marginTop: 10 },
  primaryButton: { minHeight: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginTop: 18, backgroundColor: theme.colors.primaryActionBg },
  disabled: { opacity: 0.45 },
  primaryText: { color: theme.colors.primaryActionText, fontSize: 16, fontWeight: "800" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
  secondaryText: { color: theme.colors.goldBright, fontSize: 14, fontWeight: "700" },
  secondaryDisabled: { color: theme.colors.textSecondary },
  changeButton: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  changeText: { color: theme.colors.textSecondary, fontSize: 13, textDecorationLine: "underline" },
});
