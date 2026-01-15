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
import { auth, isFirebaseConfigured } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { translateMaybeKey } from "@/utils/i18n";

type LoginScreenProps = {
  onAuthStart?: () => void;
  authError?: string | null;
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function LoginScreen({
  onAuthStart,
  authError,
}: LoginScreenProps) {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const firebaseConfigured = isFirebaseConfigured();
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
      Alert.alert(t("auth.loginTitle"), t("auth.emailInvalid"));
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
    onAuthStart?.();
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (e: any) {
      console.error(e);
      Alert.alert(t("auth.loginTitle"), e?.message ?? t("auth.loginError"));
    }
  };

  const register = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert(t("auth.registerTitle"), t("auth.emailRequired"));
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert(t("auth.registerTitle"), t("auth.emailInvalid"));
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
    onAuthStart?.();
    try {
      await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (e: any) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        Alert.alert(
          t("auth.registerTitle"),
          t("auth.emailInUse"),
        );
        return;
      }
      Alert.alert(
        t("auth.registerTitle"),
        e?.message ?? t("auth.registerError"),
      );
    }
  };

  return (
    <View style={styles.screen}>
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
