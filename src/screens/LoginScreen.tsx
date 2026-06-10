import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl } from "@/config/apiConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { ApiError } from "@/services/api/apiClient";
import { reportClientError } from "@/services/api/clientErrorsApi";
import {
  getDisplayNameValidationErrorKey,
  normalizeDisplayNameInput,
} from "@/services/user";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
type AuthMode = "login" | "register";

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

function getErrorCode(error: unknown) {
  if (error instanceof ApiError && error.code) return error.code;
  if (isNetworkLikeError(error)) return "network_request_failed";
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : "";
  return code.trim() || "unknown";
}

function getErrorStatus(error: unknown) {
  if (error instanceof ApiError) return error.status;
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : undefined;
}

function getErrorFields(error: unknown): Record<string, unknown> | undefined {
  const fields = error instanceof ApiError
    ? error.fields
    : (error as { fields?: unknown })?.fields;
  return fields && typeof fields === "object"
    ? fields as Record<string, unknown>
    : undefined;
}

function getDisplayNameBackendValidationKey(fields: Record<string, unknown>) {
  const detail = String(fields.displayName ?? "").toLowerCase();
  return detail.includes("more") || detail.includes("30")
    ? "profile.nameTooLong"
    : "profile.nameTooShort";
}

function maskEmailForDiagnostics(value: string) {
  const email = value.trim().toLowerCase();
  const [localPart = "", domainPart = ""] = email.split("@");
  const maskSegment = (segment: string) => {
    if (!segment) return "";
    return `${segment.slice(0, 1)}***`;
  };

  if (!domainPart) {
    return maskSegment(localPart);
  }

  const domainPieces = domainPart.split(".");
  const tld = domainPieces.length > 1 ? domainPieces[domainPieces.length - 1] : "";
  const domainName = domainPieces[0] ?? "";
  return `${maskSegment(localPart)}@${maskSegment(domainName)}${tld ? `.${tld}` : ""}`;
}

function reportAuthFailure(input: {
  mode: AuthMode;
  endpoint: AuthMode;
  email: string;
  error: unknown;
  messageKey: string;
}) {
  const diagnostics = {
    mode: input.mode,
    endpoint: input.endpoint,
    status: getErrorStatus(input.error) ?? null,
    code: getErrorCode(input.error),
    platform: Platform.OS,
    maskedEmail: maskEmailForDiagnostics(input.email),
    messageKey: input.messageKey,
  };

  console.warn("[auth] request failed", diagnostics);
  reportClientError({
    screen: "LoginScreen",
    action: input.endpoint,
    step: "authFailure",
    code: diagnostics.code,
    message: `${input.endpoint} failed`,
    metadata: diagnostics,
  });
}

function getSignupErrorMessageKey(error: unknown) {
  const code = getErrorCode(error);
  const fields = getErrorFields(error);
  let messageKey = "auth.unknownRegisterError";

  if (
    code === "auth/weak-password" ||
    (code === "validation_error" && fields?.password)
  ) {
    messageKey = "auth.weakPassword";
  } else if (
    code === "auth/invalid-email" ||
    (code === "validation_error" && fields?.email)
  ) {
    messageKey = "auth.invalidEmail";
  } else if (code === "validation_error" && fields?.displayName) {
    messageKey = getDisplayNameBackendValidationKey(fields);
  } else if (code === "auth/email-already-in-use" || code === "email_taken") {
    messageKey = "auth.emailInUse";
  } else if (code === "auth/too-many-requests" || code === "rate_limited") {
    messageKey = "auth.tooManyRequests";
  } else if (
    code === "auth/network-request-failed" ||
    isNetworkLikeError(error)
  ) {
    messageKey = "auth.networkError";
  }

  return { code, messageKey };
}

function getLoginErrorMessageKey(error: unknown) {
  const code = getErrorCode(error);
  let messageKey = "auth.unknownLoginError";

  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    code === "invalid_credentials" ||
    code === "unauthorized" ||
    code === "validation_error"
  ) {
    messageKey = "auth.invalidCredential";
  } else if (code === "auth/too-many-requests" || code === "rate_limited") {
    messageKey = "auth.tooManyRequests";
  } else if (
    code === "auth/network-request-failed" ||
    isNetworkLikeError(error)
  ) {
    messageKey = "auth.networkError";
  }

  return { code, messageKey };
}

export default function LoginScreen() {
  const auth = useAuth();
  const { t, locale, openLanguagePicker } = useLocale();
  const insets = useSafeAreaInsets();
  const displayNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const backendConfigured = isBackendApiConfigured();
  const isRegisterMode = mode === "register";
  const localeCode = locale.toUpperCase();
  const languageLabel = useMemo(() => {
    const translated = t("menu.languageCurrent", { code: localeCode });
    return translated === "menu.languageCurrent" ? localeCode : translated;
  }, [localeCode, t]);
  const fallbackMessage = useMemo(() => {
    if (!backendConfigured) {
      return t("auth.networkError");
    }
    return null;
  }, [backendConfigured, t]);
  const authDisabled = !backendConfigured;

  const dismissLanguagePicker = useCallback(() => {
    Keyboard.dismiss();
    openLanguagePicker();
  }, [openLanguagePicker]);

  const blurAuthInputs = useCallback(() => {
    displayNameInputRef.current?.blur();
    emailInputRef.current?.blur();
    passwordInputRef.current?.blur();
  }, []);

  const login = async () => {
    setMode("login");
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
      await auth.login({
        email: trimmedEmail,
        password,
      });
      blurAuthInputs();
      Keyboard.dismiss();
    } catch (e: unknown) {
      const { messageKey } = getLoginErrorMessageKey(e);
      reportAuthFailure({
        mode: "login",
        endpoint: "login",
        email: trimmedEmail,
        error: e,
        messageKey,
      });
      Alert.alert(t("auth.loginError"), t(messageKey));
    }
  };

  const register = async () => {
    setMode("register");
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
      await auth.register({
        email: trimmedEmail,
        password,
        displayName: trimmedDisplayName,
      });
      blurAuthInputs();
      Keyboard.dismiss();
    } catch (e: unknown) {
      const { messageKey } = getSignupErrorMessageKey(e);
      reportAuthFailure({
        mode: "register",
        endpoint: "register",
        email: trimmedEmail,
        error: e,
        messageKey,
      });
      Alert.alert(t("auth.registerError"), t(messageKey));
    }
  };

  const submitAuth = () => {
    if (mode === "register") {
      void register();
      return;
    }

    void login();
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity
        style={[styles.languageButton, { top: insets.top + 8 }]}
        onPress={dismissLanguagePicker}
        activeOpacity={0.85}
      >
        <Text style={styles.languageButtonText}>{languageLabel}</Text>
      </TouchableOpacity>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={[
              styles.container,
              {
                paddingTop: insets.top + 64,
                paddingBottom: insets.bottom + 32,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>
              {isRegisterMode ? t("auth.registerTitle") : t("auth.loginTitle")}
            </Text>
            <View style={styles.modeSwitch}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  !isRegisterMode ? styles.modeButtonActive : null,
                ]}
                onPress={() => setMode("login")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    !isRegisterMode ? styles.modeButtonTextActive : null,
                  ]}
                >
                  {t("auth.loginTitle")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  isRegisterMode ? styles.modeButtonActive : null,
                ]}
                onPress={() => setMode("register")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    isRegisterMode ? styles.modeButtonTextActive : null,
                  ]}
                >
                  {t("auth.registerTitle")}
                </Text>
              </TouchableOpacity>
            </View>
            {fallbackMessage ? (
              <Text style={styles.errorText}>{fallbackMessage}</Text>
            ) : null}
            {isRegisterMode ? (
              <TextInput
                ref={displayNameInputRef}
                style={styles.input}
                placeholder={t("auth.displayNamePlaceholder")}
                placeholderTextColor="#6B7280"
                autoCapitalize="words"
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={30}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailInputRef.current?.focus()}
              />
            ) : null}
            <TextInput
              ref={emailInputRef}
              style={styles.input}
              placeholder={t("auth.emailPlaceholder")}
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />
            <TextInput
              ref={passwordInputRef}
              style={styles.input}
              placeholder={t("auth.passwordPlaceholder")}
              placeholderTextColor="#6B7280"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isRegisterMode ? "new-password" : "password"}
              textContentType={isRegisterMode ? "newPassword" : "password"}
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={submitAuth}
            />
            {isRegisterMode ? (
              <Text style={styles.passwordHint}>{t("auth.passwordHint")}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.button, authDisabled ? styles.buttonDisabled : null]}
              onPress={submitAuth}
              disabled={authDisabled}
            >
              <Text style={styles.buttonText}>
                {isRegisterMode ? t("auth.registerButton") : t("auth.loginButton")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  keyboardAvoidingView: {
    flex: 1,
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
    flexGrow: 1,
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
  modeSwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  modeButtonActive: {
    backgroundColor: "#111827",
  },
  modeButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
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
  passwordHint: {
    marginTop: 6,
    marginBottom: 6,
    opacity: 0.75,
    fontSize: 12,
    color: "#000000",
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
