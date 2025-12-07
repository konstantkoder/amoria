import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureAuth, sendSpark } from "@/services/firebase";
import { fetchNearbyUsers } from "@/services/nearby";
import { theme } from "@/theme";
import {
  getAdultOk,
  getFlirtEnabled,
  setFlirtEnabled,
} from "@/services/moderation";

type DeckUser = {
  id: string;
  name?: string;
  displayName?: string;
  age?: number;
  photo?: string;
  bio?: string;
  about?: string;
  flirtEnabled?: boolean;
};

const SPARKS_PER_DAY = 10;
const sparksKey = () => `sparks:${new Date().toISOString().slice(0, 10)}`;

const fallbackUsers: DeckUser[] = [
  {
    id: "1",
    displayName: "Alex",
    age: 27,
    bio: "кофе, винил",
    flirtEnabled: true,
  },
  {
    id: "2",
    displayName: "Mira",
    age: 24,
    bio: "йога и фильмы",
    flirtEnabled: true,
  },
  {
    id: "3",
    displayName: "Dan",
    age: 29,
    bio: "хайкинг и борщ",
    flirtEnabled: true,
  },
];

export default function DeckScreen() {
  const [me, setMe] = useState("");
  const [users, setUsers] = useState<DeckUser[]>([]);
  const [left, setLeft] = useState(SPARKS_PER_DAY);
  const [target, setTarget] = useState<DeckUser | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [flirtOnly, setFlirtOnly] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const uid = await ensureAuth();
      if (!mounted) return;
      setMe(uid);
      const savedFlirt = await getFlirtEnabled();
      if (mounted) {
        setFlirtOnly(savedFlirt);
      }
      const saved = await AsyncStorage.getItem(sparksKey());
      if (mounted) {
        setLeft(
          saved ? Math.max(0, SPARKS_PER_DAY - Number(saved)) : SPARKS_PER_DAY,
        );
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let active = true;
    (async () => {
      try {
        const all = await fetchNearbyUsers(45.815, 15.9819, 10000);
        if (!active) return;
        const cleaned = (all || [])
          .filter((u: any) => {
            const notMe = (u.id ?? u.uid) !== me;
            if (!notMe) return false;
            if (flirtOnly) return !!u.flirtEnabled;
            return true;
          })
          .map((u: any) => ({
            ...u,
            id: u.id ?? u.uid ?? String(Math.random()),
          }));
        setUsers(cleaned);
      } catch {
        if (!active) return;
        const fallback = flirtOnly
          ? fallbackUsers.filter((u) => u.flirtEnabled)
          : fallbackUsers;
        setUsers(fallback);
      }
    })();
    return () => {
      active = false;
    };
  }, [me, flirtOnly]);

  const consumeSpark = useCallback(async () => {
    const key = sparksKey();
    const used = Number((await AsyncStorage.getItem(key)) ?? "0") + 1;
    await AsyncStorage.setItem(key, String(used));
    setLeft(Math.max(0, SPARKS_PER_DAY - used));
  }, []);

  const onSkip = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => (u.id ?? "") !== id));
  }, []);

  const onSpark = useCallback(
    (user: DeckUser) => {
      if (left <= 0) {
        Alert.alert("Лимит", "На сегодня «Искры» закончились");
        return;
      }
      setTarget(user);
      setComment("");
    },
    [left],
  );

  const send = useCallback(async () => {
    if (!target) return;
    const note = comment.trim();
    if (!note) return;
    setBusy(true);
    try {
      const matched = await sendSpark(target.id, note);
      await consumeSpark();
      setTarget(null);
      setComment("");
      if (matched) {
        Alert.alert("Матч!", "Взаимный интерес — можете перейти к диалогу 🚀");
      } else {
        Alert.alert(
          "Искра отправлена",
          "Если интерес взаимный — вы увидите матч.",
        );
      }
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось отправить «Искру»");
    } finally {
      setBusy(false);
    }
  }, [comment, consumeSpark, target]);

  const renderItem = useCallback(
    ({ item }: { item: DeckUser }) => {
      const title = item.name ?? item.displayName ?? "Без имени";
      const subtitle = item.bio ?? item.about ?? "";
      return (
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: theme.colors.text,
            }}
          >
            {title}
            {item.age ? `, ${item.age}` : ""}
          </Text>
          {!!subtitle && (
            <Text style={{ marginTop: 6, color: "#333" }}>{subtitle}</Text>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => onSpark(item)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Искра ✦</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onSkip(item.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#ddd",
              }}
            >
              <Text style={{ fontWeight: "600" }}>Пропуск</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [onSkip, onSpark],
  );

  const listEmpty = useMemo(
    () => (
      <Text style={{ marginTop: 32, textAlign: "center" }}>
        Анкет рядом пока нет
      </Text>
    ),
    [],
  );

  const toggleFlirtMode = useCallback(async () => {
    const adult = await getAdultOk();
    if (!adult) {
      Alert.alert(
        "18+",
        "Сначала подтвердите возраст в «Профиль → Флирт 18+».",
      );
      return;
    }
    const next = !flirtOnly;
    setFlirtOnly(next);
    await setFlirtEnabled(next);
  }, [flirtOnly]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Text
          style={{ fontSize: 20, fontWeight: "800", color: theme.colors.text }}
        >
          Лента · Искры: {left}
        </Text>
        <TouchableOpacity
          onPress={toggleFlirtMode}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: flirtOnly ? theme.colors.primary : "#eee",
          }}
        >
          <Text
            style={{ color: flirtOnly ? "#fff" : "#333", fontWeight: "700" }}
          >
            Флирт 18+
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={users}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
      <Modal
        visible={!!target}
        transparent
        animationType="slide"
        onRequestClose={() => setTarget(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16 }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 8 }}>
              Искра с сообщением
            </Text>
            <TextInput
              placeholder="Короткий комментарий (обязательно)"
              value={comment}
              onChangeText={setComment}
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                padding: 10,
                minHeight: 80,
              }}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setTarget(null)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ddd",
                }}
              >
                <Text style={{ textAlign: "center", fontWeight: "700" }}>
                  Отмена
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy || !comment.trim()}
                onPress={send}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: theme.colors.primary,
                  opacity: busy || !comment.trim() ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontWeight: "700",
                    color: "#fff",
                  }}
                >
                  {busy ? "Отправка…" : "Отправить"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
