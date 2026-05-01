import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl } from "@/config/apiConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getDisplayNameValidationErrorKey,
  normalizeDisplayNameInput,
} from "@/services/user";
import { ApiError } from "@/services/api/apiClient";
import {
  loginBackendSession,
  registerBackendSession,
} from "@/services/api/backendSession";
import type { BackendSession } from "@/services/api/sessionStorage";
import { translateMaybeKey } from "@/utils/i18n";

type LoginScreenProps = {
  authError?: string | null;
  onAuthenticated?: (session: BackendSession) => void;
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function isBackendApiConfigured() {
  try {
    getApiBaseUrl();
    return true;
  } catch {
    return false;
  }
}

function isNetworkLikeError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = typeof (error as { message?: unknown })?.message === "string"
    ? (error as { message: string }).message
    : "";
  return (
    message.includes("Network request failed") ||
    message.includes("Failed to fetch") ||
    message.includes("EXPO_PUBLIC_API_URL")
  );
}

function getBackendAuthErrorKey(
  error: unknown,
  operation: "login" | "register"
) {
  if (isNetworkLikeError(error)) {
    return "auth.networkError";
  }

  const code = error instanceof ApiError && typeof error.code === "string"
    ? error.code
    : "";

  switch (code) {
    case "validation_error":
    case "invalid_credentials":
    case "unauthorized":
      return "auth.invalidCredential";
    case "email_taken":
      return "auth.emailInUse";
    default:
      return operation === "login"
        ? "auth.unknownLoginError"
        : "auth.unknownRegisterError";
  }
}

function logBackendAuthError(operation: "login" | "register", error: unknown) {
  const value = error as { code?: unknown; message?: unknown; status?: unknown };
  console.error(`Backend ${operation} error`, {
    code: typeof value?.code === "string" ? value.code : "unknown",
    status: typeof value?.status === "number" ? value.status : "unknown",
    message: typeof value?.message === "string" ? value.message : "Unknown backend auth error",
  });
}

export default function LoginScreen({
  authError,
  onAuthenticated,
}: LoginScreenProps) {
  const { t, locale, openLanguagePicker } = useLocale();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const backendConfigured = isBackendApiConfigured();
  const localeCode = locale.toUpperCase();
  const languageLabel = useMemo(() => {
    const translated = t("menu.languageCurrent", { code: localeCode });
    return translated === "menu.languageCurrent" ? localeCode : translated;
  }, [localeCode, t]);
  const fallbackMessage = useMemo(() => {
    if (authError) return translateMaybeKey(authError, t, ["auth."]);
    if (!backendConfigured) {
      return t("auth.networkError");
    }
    return null;
  }, [authError, backendConfigured, t]);
  const authDisabled = !backendConfigured;

  const login = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert(t("auth.loginTitle"), t("auth.emailRequired"));
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert(t("auth.loginTitle"), t("auth.invalidEmail"));
      return;
    }
    if (!password) {
      Alert.alert(t("auth.loginTitle"), t("auth.passwordRequired"));
      return;
    }
    if (!backendConfigured) {
      Alert.alert(t("auth.loginTitle"), t("auth.networkError"));
      return;
    }
    try {
      const session = await loginBackendSession({
        email: trimmedEmail,
        password,
      });
      onAuthenticated?.(session);
    } catch (e: unknown) {
      logBackendAuthError("login", e);
      Alert.alert(t("auth.loginTitle"), t(getBackendAuthErrorKey(e, "login")));
    }
  };

  const register = async () => {
    const trimmedDisplayName = normalizeDisplayNameInput(displayName);
    const displayNameErrorKey = getDisplayNameValidationErrorKey(trimmedDisplayName);
    if (displayNameErrorKey) {
      Alert.alert(t("auth.registerTitle"), t(displayNameErrorKey));
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert(t("auth.registerTitle"), t("auth.emailRequired"));
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert(t("auth.registerTitle"), t("auth.invalidEmail"));
      return;
    }
    if (!password) {
      Alert.alert(t("auth.registerTitle"), t("auth.passwordRequired"));
      return;
    }
    if (!backendConfigured) {
      Alert.alert(t("auth.registerTitle"), t("auth.networkError"));
      return;
    }
    try {
      const session = await registerBackendSession({
        email: trimmedEmail,
        password,
        displayName: trimmedDisplayName,
      });
      onAuthenticated?.(session);
    } catch (e: unknown) {
      logBackendAuthError("register", e);
      Alert.alert(t("auth.registerTitle"), t(getBackendAuthErrorKey(e, "register")));
    }
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity
        style={[styles.languageButton, { top: insets.top + 8 }]}
        onPress={openLanguagePicker}
        activeOpacity={0.85}
      >
        <Text style={styles.languageButtonText}>{languageLabel}</Text>
      </TouchableOpacity>
      <View style={styles.container}>
        <Text style={styles.title}>{t("auth.loginTitle")}</Text>
        {fallbackMessage ? (
          <Text style={styles.errorText}>{fallbackMessage}</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder={t("auth.displayNamePlaceholder")}
          placeholderTextColor="#6B7280"
          autoCapitalize="words"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={30}
        />
        <TextInput
          style={styles.input}
          placeholder={t("auth.emailPlaceholder")}
          placeholderTextColor="#6B7280"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t("auth.passwordPlaceholder")}
          placeholderTextColor="#6B7280"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={[styles.button, authDisabled ? styles.buttonDisabled : null]}
          onPress={login}
          disabled={authDisabled}
        >
          <Text style={styles.buttonText}>{t("auth.loginButton")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.button,
            { marginTop: 8 },
            authDisabled ? styles.buttonDisabled : null,
          ]}
          onPress={register}
          disabled={authDisabled}
        >
          <Text style={styles.buttonText}>{t("auth.registerButton")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  languageButton: {
    position: "absolute",
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    zIndex: 2,
    elevation: 8,
  },
  languageButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  container: {
    flex: 1,
    padding: 24,
    alignItems: "stretch",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
    color: "#000000",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    borderColor: "#111827",
    color: "#000000",
    backgroundColor: "#FFFFFF",
  },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderColor: "#111827",
    backgroundColor: "#FFFFFF",
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#000000" },
});
