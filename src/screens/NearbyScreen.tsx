// FILE: src/screens/NearbyScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/theme";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  AdCategory,
  AdFilters,
  AVAILABLE_COUNTRIES,
  PersonalAd,
  createPersonalAd,
  getAdCategoryMeta,
  getDefaultCountry,
  subscribePersonalAds,
} from "@/services/ads";
import ScreenBackground from "@/components/ScreenBackground";

type ComposeState = {
  title: string;
  text: string;
  category: AdCategory;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: "#E5E7EB",
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function formatAgo(ts: number) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  return `${d} дн`;
}

export default function NearbyScreen() {
  const insets = useSafeAreaInsets();
  const user = auth?.currentUser ?? null;

  const defaultCountry = useMemo(() => getDefaultCountry(), []);
  const [countryCode, setCountryCode] = useState(defaultCountry.code);
  const [city, setCity] = useState<string | undefined>(
    defaultCountry.cities[0]
  );

  const [filters, setFilters] = useState<AdFilters>({
    category: "ALL",
    countryCode: defaultCountry.code,
    city: defaultCountry.cities[0],
  });

  const [ads, setAds] = useState<PersonalAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({
    title: "",
    text: "",
    category: "F4M",
  });

  useEffect(() => {
    if (!isFirebaseConfigured() || !db) return;

    setLoading(true);
    const unsub = subscribePersonalAds(db, filters, (list) => {
      setAds(list);
      setLoading(false);
    });

    return () => unsub?.();
  }, [filters]);

  const selectedCountry = useMemo(
    () => AVAILABLE_COUNTRIES.find((c) => c.code === countryCode),
    [countryCode]
  );

  const canPost = !!user && isFirebaseConfigured() && !!db;

  const onChangeFilterCategory = (cat: AdCategory) => {
    setFilters((prev) => ({ ...prev, category: cat }));
  };

  const onChangeCountry = (code: string) => {
    setCountryCode(code);
    const conf = AVAILABLE_COUNTRIES.find((c) => c.code === code);
    const firstCity = conf?.cities[0];
    setCity(firstCity);
    setFilters((prev) => ({
      ...prev,
      countryCode: code,
      city: firstCity,
    }));
  };

  const onChangeCity = (value: string) => {
    setCity(value);
    setFilters((prev) => ({
      ...prev,
      city: value,
    }));
  };

  const onToggleCompose = () => {
    if (!canPost) {
      Alert.alert(
        "Вход нужен",
        "Чтобы создавать анкеты, сначала войди или зарегистрируйся."
      );
      return;
    }
    setComposeOpen((v) => !v);
  };

  const onPublish = async () => {
    if (!canPost || !user || !db) return;

    const trimmedTitle = compose.title.trim();
    const trimmedText = compose.text.trim();
    if (!trimmedTitle || !trimmedText) {
      Alert.alert("Заполни анкету", "Нужны и заголовок, и текст.");
      return;
    }

    const country =
      AVAILABLE_COUNTRIES.find((c) => c.code === countryCode) ??
      defaultCountry;
    const cityValue = city ?? country.cities[0];

    try {
      await createPersonalAd(db, {
        authorUid: user.uid,
        title: trimmedTitle,
        text: trimmedText,
        category:
          (compose.category === "ALL" ? "Other" : compose.category) || "Other",
        countryCode: country.code,
        countryName: country.name,
        city: cityValue,
      });
      setCompose({ title: "", text: "", category: compose.category });
      setComposeOpen(false);
    } catch (e: any) {
      Alert.alert(
        "Ошибка",
        e?.message ?? "Не удалось опубликовать анкету, попробуй позже."
      );
    }
  };

  const renderCategoryFilters = () => {
    const cats: AdCategory[] = ["ALL", "F4M", "M4F", "M4M", "F4F", "Other"];

    return (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {cats.map((cat) => {
          const meta = getAdCategoryMeta(cat);
          const active = filters.category === cat;
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => onChangeFilterCategory(cat)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active
                  ? "rgba(251,191,36,1)"
                  : "rgba(156,163,175,0.6)",
                backgroundColor: active
                  ? "rgba(251,191,36,0.16)"
                  : "rgba(15,23,42,0.9)",
              }}
            >
              <Text
                style={{
                  color: active ? "#FBBF24" : "#E5E7EB",
                  fontSize: 12,
                  fontWeight: active ? "800" : "500",
                }}
              >
                {meta.short}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderLocationFilters = () => {
    const currentCountry = selectedCountry ?? defaultCountry;

    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 2 }}>
          Страна и город для объявлений
        </Text>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
          }}
        >
          {/* Страна */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 4 }}>
              Страна
            </Text>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(156,163,175,0.6)",
                backgroundColor: "rgba(15,23,42,0.9)",
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              {AVAILABLE_COUNTRIES.map((c) => {
                const active = c.code === countryCode;
                return (
                  <TouchableOpacity
                    key={c.code}
                    onPress={() => onChangeCountry(c.code)}
                    style={{
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? "#FBBF24" : "#E5E7EB",
                        fontSize: 13,
                        fontWeight: active ? "700" : "500",
                      }}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Город */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 4 }}>
              Город
            </Text>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(156,163,175,0.6)",
                backgroundColor: "rgba(15,23,42,0.9)",
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              {currentCountry.cities.map((cityName) => {
                const active = cityName === city;
                return (
                  <TouchableOpacity
                    key={cityName}
                    onPress={() => onChangeCity(cityName)}
                    style={{
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? "#FBBF24" : "#E5E7EB",
                        fontSize: 13,
                        fontWeight: active ? "700" : "500",
                      }}
                    >
                      {cityName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderCompose = () => {
    if (!composeOpen) return null;

    return (
      <View
        style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 16,
          backgroundColor: "rgba(15,23,42,0.96)",
          borderWidth: 1,
          borderColor: "rgba(251,191,36,0.4)",
        }}
      >
        <Text
          style={{
            color: "#FBBF24",
            fontSize: 14,
            fontWeight: "800",
            marginBottom: 8,
          }}
        >
          Новая анкета
        </Text>

        {/* Категория */}
        <Text
          style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 4 }}
        >
          Кого ты ищешь
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {["F4M", "M4F", "M4M", "F4F", "Other"].map((cat) => {
            const meta = getAdCategoryMeta(cat as AdCategory);
            const active = compose.category === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() =>
                  setCompose((prev) => ({ ...prev, category: cat as AdCategory }))
                }
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active
                    ? "rgba(251,191,36,1)"
                    : "rgba(156,163,175,0.6)",
                  backgroundColor: active
                    ? "rgba(251,191,36,0.18)"
                    : "rgba(15,23,42,0.9)",
                }}
              >
                <Text
                  style={{
                    color: active ? "#FBBF24" : "#E5E7EB",
                    fontSize: 11,
                    fontWeight: active ? "700" : "500",
                  }}
                >
                  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Заголовок */}
        <TextInput
          value={compose.title}
          onChangeText={(v) =>
            setCompose((prev) => ({ ...prev, title: v }))
          }
          placeholder="Короткий заголовок…"
          placeholderTextColor="#6B7280"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(156,163,175,0.6)",
            backgroundColor: "rgba(15,23,42,0.9)",
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#E5E7EB",
            fontSize: 14,
            marginBottom: 8,
          }}
        />

        {/* Текст */}
        <TextInput
          value={compose.text}
          onChangeText={(v) =>
            setCompose((prev) => ({ ...prev, text: v }))
          }
          placeholder="Расскажи пару фраз о себе и о том, кого ищешь…"
          placeholderTextColor="#6B7280"
          multiline
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(156,163,175,0.6)",
            backgroundColor: "rgba(15,23,42,0.9)",
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: "#E5E7EB",
            fontSize: 14,
            height: 90,
            textAlignVertical: "top",
            marginBottom: 10,
          }}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={() => setComposeOpen(false)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "rgba(156,163,175,0.7)",
            }}
          >
            <Text
              style={{ color: "#E5E7EB", fontSize: 13, fontWeight: "600" }}
            >
              Отмена
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onPublish}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text
              style={{ color: "white", fontSize: 13, fontWeight: "800" }}
            >
              Опубликовать
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAdItem = ({ item }: { item: PersonalAd }) => {
    const catMeta = getAdCategoryMeta(item.category);

    return (
      <View
        style={{
          borderRadius: 16,
          padding: 12,
          marginBottom: 10,
          backgroundColor: "rgba(15,23,42,0.96)",
          borderWidth: 1,
          borderColor: "rgba(55,65,81,0.9)",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              color: "#F9FAFB",
              fontSize: 15,
              fontWeight: "800",
              flex: 1,
            }}
          >
            {item.title || "Без названия"}
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            {formatAgo(item.createdAt)}
          </Text>
        </View>

        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          {catMeta.label}
        </Text>

        <Text
          style={{
            color: "#D1D5DB",
            fontSize: 13,
            marginBottom: 8,
          }}
          numberOfLines={4}
        >
          {item.text}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 12,
            }}
          >
            {item.countryName}, {item.city}
          </Text>

          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Сообщение",
                "Чат по анкете будет подключён к общему чату Amoria на следующем шаге."
              )
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "rgba(251,191,36,0.16)",
              borderWidth: 1,
              borderColor: "rgba(251,191,36,0.7)",
            }}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={14}
              color="#FBBF24"
            />
            <Text
              style={{
                color: "#FBBF24",
                fontSize: 12,
                fontWeight: "700",
                marginLeft: 4,
              }}
            >
              Написать
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScreenBackground>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "transparent" }}
      >
      <View
        style={{
          flex: 1,
          paddingTop: 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 8,
        }}
      >
          <SectionTitle>Объявления</SectionTitle>

        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          Здесь люди оставляют личные объявлении о знакомстве.{"\n"}Ты
          выбираешь страну, город и формат поиска.
        </Text>

        {renderCategoryFilters()}
        {renderLocationFilters()}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 12,
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 15,
              fontWeight: "800",
              flex: 1,
            }}
          >
            Объявления
          </Text>

          <TouchableOpacity
            onPress={onToggleCompose}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "rgba(79,70,229,0.18)",
              borderWidth: 1,
              borderColor: "rgba(129,140,248,0.7)",
            }}
          >
            <Ionicons name="add-circle-outline" size={16} color="#A5B4FC" />
            <Text
              style={{
                color: "#E5E7EB",
                fontSize: 12,
                fontWeight: "700",
                marginLeft: 4,
              }}
            >
              Новая анкета
            </Text>
          </TouchableOpacity>
        </View>

        {composeOpen && renderCompose()}

        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={ads}
            keyExtractor={(x) => x.id}
            renderItem={renderAdItem}
            contentContainerStyle={{
              paddingTop: 8,
              paddingBottom: 16,
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 20 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
                  Пока объявлений нет. Стань первым — создай анкету в своём
                  городе.
                </Text>
              </View>
            }
          />
        )}
      </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}
