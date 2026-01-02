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

type LoginScreenProps = {
  onAuthStart?: () => void;
  authError?: string | null;
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function LoginScreen({
  onAuthStart,
  authError,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { locale, setLocale } = useLocale();
  const firebaseConfigured = isFirebaseConfigured();
  const fallbackMessage = useMemo(() => {
    if (authError) return authError;
    if (!firebaseConfigured) {
      return "Firebase не настроен. Вход недоступен.";
    }
    return null;
  }, [authError, firebaseConfigured]);
  const authDisabled = !firebaseConfigured;

  const login = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert("Вход", "Введите email.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert("Вход", "Проверь формат email.");
      return;
    }
    if (!password) {
      Alert.alert("Вход", "Введите пароль.");
      return;
    }
    if (!auth) {
      Alert.alert("Вход", "Firebase не настроен. Вход недоступен.");
      return;
    }
    onAuthStart?.();
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Вход", e?.message ?? "Ошибка входа");
    }
  };

  const register = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert("Регистрация", "Введите email.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert("Регистрация", "Проверь формат email.");
      return;
    }
    if (!password) {
      Alert.alert("Регистрация", "Введите пароль.");
      return;
    }
    if (!auth) {
      Alert.alert("Регистрация", "Firebase не настроен. Регистрация недоступна.");
      return;
    }
    onAuthStart?.();
    try {
      await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (e: any) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        Alert.alert(
          "Регистрация",
          "Этот email уже зарегистрирован. Попробуйте войти.",
        );
        return;
      }
      Alert.alert("Регистрация", e?.message ?? "Ошибка регистрации");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Вход</Text>
        {fallbackMessage ? (
          <Text style={styles.errorText}>{fallbackMessage}</Text>
        ) : null}
        <View style={styles.languageBlock}>
          <Text style={styles.languageLabel}>Язык / Language</Text>
          <View style={styles.languageRow}>
            <TouchableOpacity
              onPress={() => setLocale("ru")}
              style={[
                styles.languageButton,
                locale === "ru" ? styles.languageButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  locale === "ru" ? styles.languageTextActive : null,
                ]}
              >
                Русский
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLocale("en")}
              style={[
                styles.languageButton,
                locale === "en" ? styles.languageButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  locale === "en" ? styles.languageTextActive : null,
                ]}
              >
                English
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6B7280"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Пароль"
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
          <Text style={styles.buttonText}>Войти</Text>
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
          <Text style={styles.buttonText}>Зарегистрироваться</Text>
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
  languageBlock: { marginBottom: 12 },
  languageLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    color: "#000000",
  },
  languageRow: { flexDirection: "row", gap: 8 },
  languageButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    borderColor: "#111827",
    backgroundColor: "#FFFFFF",
  },
  languageButtonActive: { backgroundColor: "#E5E7EB" },
  languageText: { fontSize: 13, fontWeight: "700", color: "#000000" },
  languageTextActive: { color: "#000000" },
});
