import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  type EventArg,
  useNavigation,
  useRoute,
} from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import {
  type PlayColorMoodRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import {
  COLOR_MOOD_SELECTION_COUNT,
  finalizeColorMoodSession,
  getPlayActivityLabel,
  getPlayColorMoodChoices,
  getPlayColorMoodOptions,
  getPlayColorMoodPhase,
  submitColorMoodChoices,
  subscribePlaySession,
  type PlaySessionDoc,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

type GuardState = {
  icon?: React.ComponentProps<typeof CoreStateCard>["icon"];
  title: string;
  body: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
};

const COLOR_OPTIONS = getPlayColorMoodOptions();

export default function PlayColorMoodScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayColorMood">>();
  const route = useRoute<PlayColorMoodRouteProp>();
  const sessionId = route.params.sessionId.trim();
  const uid = auth?.currentUser?.uid ?? "";

  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [selectedColors, setSelectedColors] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const allowExitRef = React.useRef(false);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const handleSafeBack = React.useCallback(() => {
    allowExitRef.current = true;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    goToTogether();
  }, [goToTogether, navigation]);

  const retryEntry = React.useCallback(() => {
    if (!sessionId) {
      goToTogether();
      return;
    }
    allowExitRef.current = true;
    navigation.replace("PlayColorMood", { sessionId });
  }, [goToTogether, navigation, sessionId]);

  React.useEffect(() => {
    mountedRef.current = true;
    navigationHandledRef.current = false;
    allowExitRef.current = false;
    finishPromiseRef.current = null;
    setSession(null);
    setLoadingSession(true);
    setLoadError("");
    setSelectedColors([]);
    setSubmitting(false);
    setFinishing(false);
    setActionError("");

    if (!db || !uid || !sessionId) {
      setLoadingSession(false);
      return () => {
        mountedRef.current = false;
      };
    }

    const unsubscribeSession = subscribePlaySession(
      db,
      sessionId,
      (next) => {
        if (!mountedRef.current) return;
        setSession(next);
        setLoadingSession(false);
      },
      () => {
        if (!mountedRef.current) return;
        setLoadError("Не получилось открыть палитру настроения. Попробуй зайти в неё ещё раз.");
        setLoadingSession(false);
      }
    );

    return () => {
      mountedRef.current = false;
      unsubscribeSession();
    };
  }, [sessionId, uid]);

  const partnerId = React.useMemo(
    () => session?.participantIds.find((participantId) => participantId !== uid) ?? "",
    [session?.participantIds, uid]
  );
  const partnerName = session?.participantNicknames?.[partnerId] ?? makeNickname(partnerId || "peer");
  const ownSavedChoices = React.useMemo(() => getPlayColorMoodChoices(session, uid), [session, uid]);
  const peerSavedChoices = React.useMemo(
    () => getPlayColorMoodChoices(session, partnerId),
    [partnerId, session]
  );
  const colorMoodPhase = React.useMemo(() => getPlayColorMoodPhase(session), [session]);
  const ownSelectionLocked = ownSavedChoices.length === COLOR_MOOD_SELECTION_COUNT;
  const displaySelection = ownSelectionLocked ? ownSavedChoices : selectedColors;
  const remainingCount = Math.max(COLOR_MOOD_SELECTION_COUNT - displaySelection.length, 0);
  const waitingForPeer =
    colorMoodPhase === "picking" &&
    ownSelectionLocked &&
    peerSavedChoices.length !== COLOR_MOOD_SELECTION_COUNT;

  const openResultScreen = React.useCallback(() => {
    if (!mountedRef.current || navigationHandledRef.current || !sessionId) return;
    navigationHandledRef.current = true;
    allowExitRef.current = true;
    navigation.replace("PlayResult", { sessionId });
  }, [navigation, sessionId]);

  const redirectToCanvas = React.useCallback(() => {
    if (!mountedRef.current || navigationHandledRef.current || !sessionId) return;
    navigationHandledRef.current = true;
    allowExitRef.current = true;
    navigation.replace("PlayCanvas", { sessionId });
  }, [navigation, sessionId]);

  React.useEffect(() => {
    if (!session) return;

    if (session.activity !== "color_mood") {
      if (session.status === "active") {
        redirectToCanvas();
        return;
      }
      openResultScreen();
      return;
    }

    if (session.status === "finished" || session.status === "revealed" || colorMoodPhase === "finished") {
      openResultScreen();
    }
  }, [colorMoodPhase, openResultScreen, redirectToCanvas, session]);

  React.useEffect(() => {
    if (ownSelectionLocked || !selectedColors.length) return;
    setSelectedColors((prev) => prev.filter((hex) => COLOR_OPTIONS.some((option) => option.hex === hex)));
  }, [ownSelectionLocked, selectedColors.length]);

  const completeSession = React.useCallback(async () => {
    if (!db || !sessionId) {
      openResultScreen();
      return;
    }
    if (finishPromiseRef.current) {
      await finishPromiseRef.current;
      return;
    }

    const task = (async () => {
      if (mountedRef.current) {
        setFinishing(true);
      }

      if (session?.activity === "color_mood" && session.status === "active") {
        try {
          await finalizeColorMoodSession(db, sessionId);
        } catch {}
      }

      openResultScreen();
    })().finally(() => {
      finishPromiseRef.current = null;
      if (mountedRef.current) {
        setFinishing(false);
      }
    });

    finishPromiseRef.current = task;
    try {
      await task;
    } catch {}
  }, [db, openResultScreen, session?.activity, session?.status, sessionId]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: EventArg<"beforeRemove", true, undefined>) => {
      if (allowExitRef.current || navigationHandledRef.current) return;
      if (session?.status !== "active" || session.activity !== "color_mood") return;

      event.preventDefault();
      Alert.alert(
        "Завершить палитру?",
        ownSelectionLocked
          ? "Если выйти сейчас, мы мягко завершим сессию с теми цветами, которые уже собраны, и сразу откроем итог."
          : "Если выйти сейчас, незакреплённые цвета не сохранятся. Мы мягко завершим сессию и сразу откроем итог.",
        [
          { text: "Остаться", style: "cancel" },
          {
            text: "Завершить",
            style: "destructive",
            onPress: () => {
              void completeSession();
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [completeSession, navigation, ownSelectionLocked, session?.activity, session?.status]);

  const toggleColor = React.useCallback(
    (hex: string) => {
      if (ownSelectionLocked || submitting || finishing || waitingForPeer) return;

      setSelectedColors((prev) => {
        if (prev.includes(hex)) {
          return prev.filter((item) => item !== hex);
        }
        if (prev.length >= COLOR_MOOD_SELECTION_COUNT) {
          return prev;
        }
        return [...prev, hex];
      });
      setActionError("");
    },
    [finishing, ownSelectionLocked, submitting, waitingForPeer]
  );

  const handleSubmit = React.useCallback(async () => {
    if (!db || !uid || !sessionId || ownSelectionLocked || submitting || finishing) return;
    if (selectedColors.length !== COLOR_MOOD_SELECTION_COUNT) {
      setActionError("Нужно выбрать ровно 3 цвета, чтобы закрепить палитру.");
      return;
    }

    setSubmitting(true);
    setActionError("");
    try {
      const result = await submitColorMoodChoices(db, sessionId, uid, selectedColors);
      if (!mountedRef.current) return;

      if (result.state === "finished") {
        openResultScreen();
        return;
      }

      if (result.state === "ignored") {
        setActionError("Сейчас не получилось сохранить выбор. Попробуй еще раз.");
      }
    } catch {
      if (mountedRef.current) {
        setActionError("Не удалось сохранить цвета. Попробуй еще раз.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [db, finishing, openResultScreen, ownSelectionLocked, selectedColors, sessionId, submitting, uid]);

  const guardState = React.useMemo<GuardState | null>(() => {
    if (!uid) {
      return {
        icon: "person-circle-outline",
        title: "Не удалось открыть палитру",
        body: "Чтобы войти в совместную палитру, нужен активный аккаунт.",
        primaryLabel: "Открыть профиль",
        primaryAction: () => navigation.navigate("Profile"),
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    if (!db) {
      return {
        icon: "cloud-offline-outline",
        title: "Палитра пока недоступна",
        body: "Мы не смогли подготовить подключение к этой сессии. Вернись назад или попробуй позже.",
        primaryLabel: "Во Вместе",
        primaryAction: goToTogether,
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    if (!sessionId) {
      return {
        icon: "alert-circle-outline",
        title: "Сессия не найдена",
        body: "Не получилось открыть палитру настроения без идентификатора сессии.",
        primaryLabel: "Во Вместе",
        primaryAction: goToTogether,
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    if (loadError) {
      return {
        icon: "cloud-offline-outline",
        title: "Подключение прервалось",
        body: loadError,
        primaryLabel: "Попробовать снова",
        primaryAction: retryEntry,
        secondaryLabel: "Во Вместе",
        secondaryAction: goToTogether,
      };
    }

    if (!loadingSession && !session) {
      return {
        icon: "albums-outline",
        title: "Сессия больше недоступна",
        body: "Её уже закрыли или она не успела сохраниться. Можно вернуться во Вместе и начать заново.",
        primaryLabel: "Во Вместе",
        primaryAction: goToTogether,
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    return null;
  }, [goToTogether, handleSafeBack, loadError, loadingSession, navigation, retryEntry, session, sessionId, uid]);

  if (guardState) {
    return (
      <ScreenShell title="Палитра настроения" background="togetherStory" showBack onBack={handleSafeBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon={guardState.icon}
            title={guardState.title}
            body={guardState.body}
            primaryAction={{
              label: guardState.primaryLabel,
              onPress: guardState.primaryAction,
            }}
            secondaryAction={
              guardState.secondaryLabel && guardState.secondaryAction
                ? {
                    label: guardState.secondaryLabel,
                    onPress: guardState.secondaryAction,
                  }
                : undefined
            }
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadingSession) {
    return (
      <ScreenShell title="Палитра настроения" background="togetherStory" showBack onBack={handleSafeBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="color-palette-outline"
            title="Подключаем палитру"
            body="Сейчас загрузим совместную сессию и покажем цвета для выбора."
          />
        </View>
      </ScreenShell>
    );
  }

  const modeLabel = getPlayActivityLabel(session?.activity ?? "color_mood", "neutral");
  const phaseTitle = ownSelectionLocked
    ? waitingForPeer
      ? "Ждём выбор второго участника"
      : "Цвета уже собраны"
    : "Выбери 3 цвета";
  const phaseText = ownSelectionLocked
    ? waitingForPeer
      ? "Твой выбор уже закреплён. Как только второй участник закончит, мы сразу соберём общую палитру и откроем итог."
      : "Твой выбор уже закреплён. Остаётся дождаться перехода к итогу."
    : "Каждый выбирает по три цвета. Потом мы соберём общую палитру пары и мягкую совместную композицию.";

  return (
    <ScreenShell
      title="Палитра настроения"
      background="togetherStory"
      showBack
      onBack={() => {
        if (session?.status !== "active") {
          handleSafeBack();
          return;
        }
        Alert.alert(
          "Завершить палитру?",
          ownSelectionLocked
            ? "Если выйти сейчас, мы завершим палитру с тем, что уже успело собраться."
            : "Если выйти сейчас, незакреплённые цвета не сохранятся.",
          [
            { text: "Остаться", style: "cancel" },
            {
              text: "Завершить",
              style: "destructive",
              onPress: () => {
                void completeSession();
              },
            },
          ]
        );
      }}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>{modeLabel}</Text>
          <Text style={styles.heroTitle}>{phaseTitle}</Text>
          <Text style={styles.heroText}>{phaseText}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Напарник</Text>
              <Text style={styles.metaValue}>{partnerName}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Осталось выбрать</Text>
              <Text style={styles.metaValue}>{remainingCount}</Text>
            </View>
          </View>

          <View style={styles.selectionSummary}>
            <Text style={styles.selectionTitle}>Твои выбранные цвета</Text>
            <View style={styles.selectionRow}>
              {displaySelection.length ? (
                displaySelection.map((hex) => (
                  <View key={hex} style={styles.selectionChip}>
                    <View style={[styles.selectionDot, { backgroundColor: hex }]} />
                    <Text style={styles.selectionChipText}>
                      {COLOR_OPTIONS.find((option) => option.hex === hex)?.label ?? hex}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.selectionHint}>Пока пусто. Выбери ровно 3 цвета.</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.paletteCard}>
          <Text style={styles.paletteTitle}>Доступные цвета</Text>
          <Text style={styles.paletteText}>
            После подтверждения выбор фиксируется. Повторно ломать flow не придётся.
          </Text>

          <View style={styles.grid}>
            {COLOR_OPTIONS.map((option) => {
              const selected = displaySelection.includes(option.hex);
              const disabled =
                (!selected && displaySelection.length >= COLOR_MOOD_SELECTION_COUNT) ||
                ownSelectionLocked ||
                submitting ||
                finishing;

              return (
                <Pressable
                  key={option.id}
                  disabled={disabled}
                  onPress={() => toggleColor(option.hex)}
                  style={[
                    styles.colorButton,
                    selected && styles.colorButtonSelected,
                    disabled && !selected ? styles.colorButtonDisabled : null,
                  ]}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: option.hex }]} />
                  <Text style={styles.colorLabel}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

          <Pressable
            disabled={
              ownSelectionLocked ||
              submitting ||
              finishing ||
              selectedColors.length !== COLOR_MOOD_SELECTION_COUNT
            }
            onPress={() => void handleSubmit()}
            style={[
              styles.primaryButton,
              (ownSelectionLocked ||
                submitting ||
                finishing ||
                selectedColors.length !== COLOR_MOOD_SELECTION_COUNT) &&
                styles.primaryButtonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {ownSelectionLocked
                ? waitingForPeer
                  ? "Ждём выбор второго участника"
                  : "Цвета уже собраны"
                : submitting
                  ? "Сохраняем…"
                  : "Готово"}
            </Text>
          </Pressable>
        </View>

        {waitingForPeer ? (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingTitle}>Ждём выбор второго участника</Text>
            <Text style={styles.waitingText}>
              Твои 3 цвета уже сохранены. Как только {partnerName} закончит, мы сразу соберём вашу
              общую палитру.
            </Text>
          </View>
        ) : null}

        {peerSavedChoices.length === COLOR_MOOD_SELECTION_COUNT && !waitingForPeer ? (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingTitle}>Второй участник уже выбрал цвета</Text>
            <Text style={styles.waitingText}>
              Палитра почти готова. Мы откроем итог, как только сессия окончательно соберётся.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 20,
    backgroundColor: "rgba(17, 20, 36, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 14,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    gap: 10,
  },
  metaCard: {
    flex: 1,
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  selectionSummary: {
    gap: 8,
  },
  selectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  selectionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  selectionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectionChipText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  selectionHint: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  paletteCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  paletteTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  paletteText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorButton: {
    width: "47%",
    minWidth: 150,
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  colorButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(255, 78, 138, 0.12)",
  },
  colorButtonDisabled: {
    opacity: 0.55,
  },
  colorSwatch: {
    width: "100%",
    height: 54,
    borderRadius: 14,
  },
  colorLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  inlineError: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    borderRadius: theme.shapes.pill,
    paddingVertical: 15,
    paddingHorizontal: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  waitingCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(18, 14, 30, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  waitingTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  waitingText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
