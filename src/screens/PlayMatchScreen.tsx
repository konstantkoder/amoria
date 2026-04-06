import React from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  cancelPlayRequest,
  enqueuePlayRequest,
  subscribeOwnQueueEntry,
  tryMatchWaitingPlayer,
  type PlayActivity,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

export default function PlayMatchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const activity = (route.params?.activity ?? "draw") as PlayActivity;
  const user = auth?.currentUser ?? null;
  const uid = user?.uid ?? "";
  const nickname = React.useMemo(() => makeNickname(uid), [uid]);
  const [busy, setBusy] = React.useState(false);
  const [statusText, setStatusText] = React.useState("Поднимаем очередь для общего холста...");
  const mountedRef = React.useRef(true);
  const matchedSessionRef = React.useRef("");
  const cancelledRef = React.useRef(false);
  const cancellingPromiseRef = React.useRef<Promise<void> | null>(null);

  const setBusySafe = React.useCallback((value: boolean) => {
    if (!mountedRef.current) return;
    setBusy(value);
  }, []);

  const setStatusTextSafe = React.useCallback((value: string) => {
    if (!mountedRef.current) return;
    setStatusText(value);
  }, []);

  const cancelQueue = React.useCallback(async () => {
    if (!db || !uid || matchedSessionRef.current) return;
    if (cancellingPromiseRef.current) {
      await cancellingPromiseRef.current;
      return;
    }

    const task = cancelPlayRequest(db, uid).catch(() => {});
    cancellingPromiseRef.current = task;
    await task;
    cancellingPromiseRef.current = null;
  }, [uid]);

  const enterSession = React.useCallback(
    (nextSessionId: string) => {
      if (!nextSessionId || matchedSessionRef.current || !mountedRef.current) return;
      matchedSessionRef.current = nextSessionId;
      navigation.replace("PlayCanvas", { sessionId: nextSessionId });
    },
    [navigation]
  );

  React.useEffect(() => {
    mountedRef.current = true;
    cancelledRef.current = false;

    if (!isFirebaseConfigured() || !db || !uid) {
      Alert.alert(
        "Parallel Play недоступен",
        "Нужен активный вход в аккаунт и готовый Firebase.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
      return;
    }

    setBusySafe(true);
    const unsubscribe = subscribeOwnQueueEntry(db, uid, (entry) => {
      if (entry?.status === "cancelled" && !matchedSessionRef.current) {
        setStatusTextSafe("Поиск остановлен. Можно вернуться и попробовать снова.");
        setBusySafe(false);
        return;
      }

      if (entry?.sessionId) {
        enterSession(entry.sessionId);
      }
    });

    void (async () => {
      try {
        await enqueuePlayRequest(db, uid, activity, nickname);
        if (!mountedRef.current || cancelledRef.current || matchedSessionRef.current) {
          await cancelQueue();
          return;
        }
        setStatusTextSafe("Ищем человека, который тоже готов рисовать прямо сейчас...");
        const result = await tryMatchWaitingPlayer(db, uid, nickname, activity);
        if (!mountedRef.current || cancelledRef.current) {
          if (!result.sessionId) {
            await cancelQueue();
          }
          return;
        }
        if (result.sessionId) {
          enterSession(result.sessionId);
        }
      } catch {
        if (!mountedRef.current || cancelledRef.current) return;
        Alert.alert(
          "Не удалось начать поиск",
          "Попробуй еще раз через пару секунд.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } finally {
        setBusySafe(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      unsubscribe();
      void cancelQueue();
    };
  }, [activity, cancelQueue, enterSession, navigation, nickname, setBusySafe, setStatusTextSafe, uid]);

  const handleCancel = React.useCallback(async () => {
    cancelledRef.current = true;
    await cancelQueue();
    navigation.goBack();
  }, [cancelQueue, navigation]);

  return (
    <ScreenShell
      title="Поиск напарника"
      background="nightCity"
      showBack
      onBack={handleCancel}
    >
      <View style={styles.container}>
        <View style={styles.orbitWrap}>
          <View style={styles.orbitLarge} />
          <View style={styles.orbitSmall} />
          <View style={styles.centerGlow}>
            <Text style={styles.centerText}>draw</Text>
          </View>
        </View>

        <Text style={styles.title}>Подбираем пару</Text>
        <Text style={styles.body}>{statusText}</Text>
        <Text style={styles.caption}>
          {busy
            ? "Сеанс начнется сразу после совпадения."
            : "Ожидаем подтверждение и следим за очередью."}
        </Text>

        <Pressable onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Отменить</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  orbitWrap: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  orbitLarge: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  orbitSmall: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  centerGlow: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.colors.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  centerText: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 10,
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 10,
  },
  caption: {
    color: theme.colors.muted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 26,
  },
  cancelButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  cancelText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
