import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
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
import { Ionicons } from "@expo/vector-icons";
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
import ScreenBackground from "@/components/ScreenBackground";
import { theme } from "@/theme";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
type AuthMode = "login" | "register";
type AuthStage = "welcome" | "auth";

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
  const [stage, setStage] = useState<AuthStage>("welcome");
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

  const openAuth = (nextMode: AuthMode) => {
    setMode(nextMode);
    setStage("auth");
  };

  return (
    <ScreenBackground variant="startLighthouseV6" blurRadius={0}>
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
                stage === "welcome" ? styles.welcomeContainer : styles.authContainer,
                {
                  paddingTop: stage === "welcome" ? insets.top + 88 : insets.top + 60,
                  paddingBottom: insets.bottom + 26,
                },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {stage === "welcome" ? (
                <>
                  <View style={styles.brandGroup}>
                    <Image
                      source={require("../../assets/brand/amoria_startup_mark_1024.png")}
                      resizeMode="contain"
                      style={styles.brandMark}
                      accessible={false}
                    />
                    <Text style={styles.wordmark}>Amoria</Text>
                  </View>
                  <Text style={styles.tagline}>{t("start.tagline")}</Text>
                  <View style={styles.actionZone}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.welcomePrimary}
                      onPress={() => openAuth("register")}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.welcomePrimaryText}>{t("start.begin")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.welcomeSecondary}
                      onPress={() => openAuth("login")}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.welcomeSecondaryText}>{t("start.login")}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={t("auth.backToWelcome")}
                    style={styles.backButton}
                    onPress={() => setStage("welcome")}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="chevron-back" size={24} color={theme.colors.goldBright} />
                  </TouchableOpacity>
                  <View style={styles.authCard}>
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
                  placeholderTextColor="rgba(226,232,255,0.46)"
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
                placeholderTextColor="rgba(226,232,255,0.46)"
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
                placeholderTextColor="rgba(226,232,255,0.46)"
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
                accessibilityRole="button"
                accessibilityState={{ disabled: authDisabled }}
              >
                <Text
                  style={[
                    styles.buttonText,
                    authDisabled ? styles.buttonTextDisabled : null,
                  ]}
                >
                  {isRegisterMode ? t("auth.registerButton") : t("auth.loginButton")}
                </Text>
              </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  languageButton: {
    position: "absolute",
    right: 16,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: 1,
    borderColor: theme.buttons.secondary.borderColor,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    elevation: 8,
  },
  languageButtonText: {
    color: theme.buttons.secondary.textColor,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  container: {
    flexGrow: 1,
    padding: 24,
    alignItems: "stretch",
  },
  welcomeContainer: {
    justifyContent: "flex-start",
  },
  authContainer: {
    justifyContent: "center",
  },
  brandGroup: {
    alignItems: "center",
  },
  brandMark: {
    width: 66,
    height: 66,
  },
  wordmark: {
    marginTop: 18,
    color: theme.colors.textWarm,
    fontFamily: "serif",
    fontSize: 42,
    lineHeight: 50,
    fontWeight: "600",
  },
  tagline: {
    marginTop: 52,
    maxWidth: 300,
    alignSelf: "center",
    color: "rgba(249,250,255,0.76)",
    fontSize: 17,
    lineHeight: 25,
    textAlign: "center",
  },
  actionZone: {
    marginTop: "auto",
    paddingTop: 48,
  },
  welcomePrimary: {
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryActionBg,
  },
  welcomePrimaryText: {
    color: theme.colors.primaryActionText,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  welcomeSecondary: {
    minHeight: 44,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeSecondaryText: {
    color: theme.colors.gold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  backButton: {
    width: 44,
    height: 44,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  authCard: {
    padding: 20,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  title: {
    fontFamily: "serif",
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
    color: theme.colors.textPrimary,
  },
  modeSwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.chipBg,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.chipActiveBg,
  },
  modeButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  modeButtonTextActive: {
    color: "#F6F2EC",
  },
  errorText: {
    color: theme.colors.dangerText,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 10,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginVertical: 6,
    borderColor: "rgba(230,185,118,0.14)",
    color: theme.colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.045)",
    fontSize: 15,
    lineHeight: 20,
  },
  passwordHint: {
    marginTop: 6,
    marginBottom: 6,
    opacity: 0.75,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  button: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: theme.buttons.primary.borderRadius,
    paddingHorizontal: theme.buttons.primary.paddingHorizontal,
    alignItems: "center",
    borderColor: theme.buttons.primary.borderColor,
    backgroundColor: theme.buttons.primary.backgroundColor,
  },
  buttonDisabled: {
    backgroundColor: "rgba(230,185,118,0.08)",
    borderColor: "rgba(230,185,118,0.18)",
  },
  buttonText: {
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
    color: theme.buttons.primary.textColor,
  },
  buttonTextDisabled: {
    color: "rgba(230,185,118,0.52)",
  },
});
