import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { askLocationPermission, getCurrentPosition } from "@/services/geo";
import { fetchNearbyUsers } from "@/services/nearby";
import { ensureAuth, reportUser, blockUser } from "@/services/firebase";
import { theme } from "@/theme/theme";
import {
  getAdultOk,
  getFlirtEnabled,
  setFlirtEnabled,
} from "@/services/moderation";

const ranges = [2000, 5000, 10000]; // метры
const intents = ["dating", "friends", "network"] as const;
type Intent = (typeof intents)[number];

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipTxt, active && s.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function NearbyScreen() {
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string>("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number>(10000);
  const [filters, setFilters] = useState<Record<Intent, boolean>>({
    dating: true,
    friends: true,
    network: true,
  });
  const [flirtOnly, setFlirtOnly] = useState(false);

  async function load(lat: number, lng: number) {
    setLoading(true);
    try {
      const data = await fetchNearbyUsers(lat, lng, radius);
      setDataRaw(data);
    } finally {
      setLoading(false);
    }
  }

  // сырые данные и отфильтрованные
  const [dataRaw, setDataRaw] = useState<any[]>([]);
  const selectedIntents = useMemo(
    () => intents.filter((i) => filters[i]),
    [filters],
  );
  const data = useMemo(
    () =>
      dataRaw.filter(
        (u) =>
          selectedIntents.includes(u.goal as Intent) &&
          (!flirtOnly || !!u.flirtEnabled),
      ),
    [dataRaw, selectedIntents, flirtOnly],
  );

  useEffect(() => {
    (async () => {
      const id = await ensureAuth();
      setUid(id);
      const localFlirt = await getFlirtEnabled();
      setFlirtOnly(localFlirt);
      try {
        await askLocationPermission();
      } catch {}
      try {
        const { lat, lng } = await getCurrentPosition();
        setPos({ lat, lng });
        await load(lat, lng);
      } catch {
        // fallback: Загреб
        const lat = 45.815,
          lng = 15.9819;
        setPos({ lat, lng });
        await load(lat, lng);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pos) load(pos.lat, pos.lng);
  }, [radius, filters, pos]);

  function toggleIntent(i: Intent) {
    setFilters((v) => ({ ...v, [i]: !v[i] }));
  }

  async function onReport(u: any) {
    await reportUser(uid, u.id, "inappropriate");
    Alert.alert("Спасибо", "Жалоба отправлена");
  }
  async function onBlock(u: any) {
    await blockUser(uid, u.id);
    Alert.alert("Готово", "Пользователь заблокирован");
  }

  async function toggleFlirt() {
    const adult = await getAdultOk();
    if (!adult) {
      Alert.alert("18+", "Подтвердите возраст в Профиль → Флирт 18+");
      return;
    }
    const next = !flirtOnly;
    setFlirtOnly(next);
    await setFlirtEnabled(next);
  }

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.h1}>Люди рядом</Text>
        <TouchableOpacity
          onPress={toggleFlirt}
          style={[
            s.flirtPill,
            { backgroundColor: flirtOnly ? theme.colors.primary : "#eee" },
          ]}
        >
          <Text
            style={{ color: flirtOnly ? "#fff" : "#333", fontWeight: "700" }}
          >
            Флирт 18+
          </Text>
        </TouchableOpacity>
      </View>
      <View style={s.row}>
        {ranges.map((r) => (
          <Chip
            key={r}
            label={r / 1000 + " км"}
            active={radius === r}
            onPress={() => setRadius(r)}
          />
        ))}
      </View>
      <View style={s.row}>
        {intents.map((i) => (
          <Chip
            key={i}
            label={i}
            active={filters[i]}
            onPress={() => toggleIntent(i)}
          />
        ))}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
          data={data}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => (
            <View style={s.card}>
              <Text style={s.title}>
                {item.name} • {Math.round(item.distance / 100) / 10} км
              </Text>
              <Text style={s.sub}>
                {item.goal} • {item.mood || "—"}
              </Text>
              <View style={s.actions}>
                <TouchableOpacity
                  onPress={() => onReport(item)}
                  style={[s.actionBtn, { borderColor: "#d33" }]}
                >
                  <Text style={s.actionTxt}>Пожаловаться</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onBlock(item)}
                  style={[s.actionBtn, { borderColor: "#888" }]}
                >
                  <Text style={s.actionTxt}>Блок</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={s.sub}>Нет результатов для выбранных фильтров</Text>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.bg, padding: 16 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  h1: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  flirtPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipTxt: { color: "#333", fontWeight: "700", textTransform: "capitalize" },
  chipTxtOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  title: { color: theme.colors.text, fontWeight: "800" },
  sub: { color: "#666", marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionTxt: { color: "#222", fontWeight: "700" },
});
