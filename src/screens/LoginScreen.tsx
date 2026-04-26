import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, isFirebaseConfigured } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { translateMaybeKey } from "@/utils/i18n";

type LoginScreenProps = {
  authError?: string | null;
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function getFirebaseAuthErrorKey(
  error: unknown,
  operation: "login" | "register"
) {
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : "";

  switch (code) {
    case "auth/invalid-email":
      return "auth.invalidEmail";
    case "auth/invalid-credential":
      return "auth.invalidCredential";
    case "auth/user-not-found":
      return "auth.userNotFound";
    case "auth/wrong-password":
      return "auth.wrongPassword";
    case "auth/email-already-in-use":
      return "auth.emailInUse";
    case "auth/weak-password":
      return "auth.weakPassword";
    case "auth/too-many-requests":
      return "auth.tooManyRequests";
    case "auth/network-request-failed":
      return "auth.networkError";
    default:
      return operation === "login"
        ? "auth.unknownLoginError"
        : "auth.unknownRegisterError";
  }
}

function logFirebaseAuthError(operation: "login" | "register", error: unknown) {
  const value = error as { code?: unknown; message?: unknown };
  console.error(`Firebase ${operation} error`, {
    code: typeof value?.code === "string" ? value.code : "unknown",
    message: typeof value?.message === "string" ? value.message : "Unknown Firebase auth error",
  });
}

export default function LoginScreen({ authError }: LoginScreenProps) {
  const { t, locale, openLanguagePicker } = useLocale();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const firebaseConfigured = isFirebaseConfigured();
  const localeCode = locale.toUpperCase();
  const languageLabel = useMemo(() => {
    const translated = t("menu.languageCurrent", { code: localeCode });
    return translated === "menu.languageCurrent" ? localeCode : translated;
  }, [localeCode, t]);
  const fallbackMessage = useMemo(() => {
    if (authError) return translateMaybeKey(authError, t, ["auth."]);
    if (!firebaseConfigured) {
      return t("auth.firebaseDisabledLogin");
    }
    return null;
  }, [authError, firebaseConfigured, t]);
  const authDisabled = !firebaseConfigured;

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
    if (!auth) {
      Alert.alert(t("auth.loginTitle"), t("auth.firebaseDisabledLogin"));
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (e: unknown) {
      logFirebaseAuthError("login", e);
      Alert.alert(t("auth.loginTitle"), t(getFirebaseAuthErrorKey(e, "login")));
    }
  };

  const register = async () => {
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
    if (!auth) {
      Alert.alert(t("auth.registerTitle"), t("auth.firebaseDisabledRegister"));
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (e: unknown) {
      logFirebaseAuthError("register", e);
      Alert.alert(t("auth.registerTitle"), t(getFirebaseAuthErrorKey(e, "register")));
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
