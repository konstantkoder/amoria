// NOTE: This file is a modified copy of the original NearbyScreen from the
// Amoria project. The primary change here is the use of a new background
// variant and custom overlay/blur settings to give the "Объявления" (Nearby)
// screen a fresh look. The rest of the logic remains unchanged from upstream.

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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import ScreenShell from "@/components/ScreenShell";
import NeonBorder from "@/components/NeonBorder";
import { useLocale } from "@/contexts/LocaleContext";
import { formatAgoLong } from "@/utils/timeAgo";

// Compose state holds temporary data for creating a personal ad.
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

export default function NearbyScreen() {
  const insets = useSafeAreaInsets();
  const user = auth?.currentUser ?? null;
  const { t } = useLocale();

  const defaultCountry = useMemo(() => getDefaultCountry(), []);
  const [countryCode, setCountryCode] = useState(defaultCountry.code);
  const [city, setCity] = useState<string | undefined>(
    defaultCountry.cities[0],
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
    [countryCode],
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
      Alert.alert(t("ads.signInTitle"), t("ads.signInBody"));
      return;
    }
    setComposeOpen((v) => !v);
  };

  const onPublish = async () => {
    if (!canPost || !user || !db) return;

    const trimmedTitle = compose.title.trim();
    const trimmedText = compose.text.trim();
    if (!trimmedTitle || !trimmedText) {
      Alert.alert(t("ads.fillTitle"), t("ads.fillBody"));
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
        countryName: country.nameKey,
        city: cityValue,
      });
      setCompose({ title: "", text: "", category: compose.category });
      setComposeOpen(false);
    } catch (e: any) {
      Alert.alert(
        t("ads.publishFailedTitle"),
        e?.message ?? t("ads.publishFailedBody"),
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
            <NeonBorder key={cat} active={active}>
              <TouchableOpacity
                onPress={() => onChangeFilterCategory(cat)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  // Make category chips feel livelier: use the accent color for
                  // active states and subtler borders/backgrounds otherwise.
                  backgroundColor: active
                    ? "rgba(255,122,60,0.2)"
                    : theme.colors.pillBg,
                }}
              >
                <Text
                  style={{
                  color: active ? theme.colors.accent : theme.colors.pillText,
                  fontSize: 12,
                  fontWeight: active ? "800" : "600",
                  }}
                >
                  {t(meta.shortKey)}
                </Text>
              </TouchableOpacity>
            </NeonBorder>
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
          {t("ads.filterTitle")}
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
              {t("ads.country")}
            </Text>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                // Use subtle border and soft background for better contrast.
                borderColor: theme.colors.borderSubtle,
                backgroundColor: theme.colors.backgroundSoft,
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
                        color: active ? theme.colors.accent : theme.colors.pillText,
                        fontSize: 13,
                        fontWeight: active ? "700" : "600",
                      }}
                    >
                      {t(c.nameKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Город */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 4 }}>
              {t("ads.city")}
            </Text>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.borderSubtle,
                backgroundColor: theme.colors.backgroundSoft,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              {currentCountry.cities.map((cityKey) => {
                const active = cityKey === city;
                return (
                  <TouchableOpacity
                    key={cityKey}
                    onPress={() => onChangeCity(cityKey)}
                    style={{
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? theme.colors.accent : theme.colors.pillText,
                        fontSize: 13,
                        fontWeight: active ? "700" : "600",
                      }}
                    >
                      {t(cityKey)}
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
          // Soft card background with a subtle border for the compose form
          backgroundColor: theme.colors.backgroundSoft,
          borderWidth: 1,
          borderColor: theme.colors.primary,
        }}
      >
        <Text
          style={{
            color: theme.colors.primary,
            fontSize: 14,
            fontWeight: "800",
            marginBottom: 8,
          }}
        >
          {t("ads.newForm")}
        </Text>

        {/* Категория */}
        <Text style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 4 }}>
          {t("ads.whoLookingFor")}
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
                    ? theme.colors.accent
                    : theme.colors.borderSubtle,
                  backgroundColor: active
                    ? "rgba(255,122,60,0.2)"
                    : theme.colors.pillBg,
                }}
              >
                <Text
                  style={{
                    color: active ? theme.colors.accent : theme.colors.pillText,
                    fontSize: 11,
                    fontWeight: active ? "700" : "600",
                  }}
                >
                  {t(meta.labelKey)}
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
          placeholder={t("ads.titlePlaceholder")}
          placeholderTextColor="#6B7280"
          style={{
            borderRadius: 12,
            borderWidth: 1,
            // Softer background and subtle border for title input
            borderColor: theme.colors.borderSubtle,
            backgroundColor: theme.colors.backgroundSoft,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: theme.colors.pillText,
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
          placeholder={t("ads.textPlaceholder")}
          placeholderTextColor="#6B7280"
          multiline
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.borderSubtle,
            backgroundColor: theme.colors.backgroundSoft,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: theme.colors.pillText,
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
              {t("common.cancel")}
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
              {t("ads.publish")}
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
          // Ad cards use a soft background and subtle border to match other panels
          backgroundColor: theme.colors.backgroundSoft,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
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
            {item.title || t("ads.untitled")}
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            {formatAgoLong(item.createdAt, t)}
          </Text>
        </View>

        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          {t(catMeta.labelKey)}
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
          {(item.countryName.startsWith("geo.")
            ? t(item.countryName)
            : item.countryName)},{" "}
          {item.city.startsWith("geo.") ? t(item.city) : item.city}
        </Text>

        <TouchableOpacity
          onPress={() =>
            Alert.alert(t("ads.messageTitle"), t("ads.messageBody"))
          }
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "rgba(255,78,138,0.18)",
              borderWidth: 1,
              borderColor: theme.colors.primary,
            }}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={14}
              color={theme.colors.primary}
            />
            <Text
              style={{
                color: theme.colors.primary,
                fontSize: 12,
                fontWeight: "700",
                marginLeft: 4,
              }}
            >
              {t("ads.write")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScreenShell
      title={t("tabs.ads")}
      background="ads"
      overlayOpacity={0.18}
      blurRadius={0}
      debugTint={false}
    >
      <View
        style={{
          flex: 1,
          paddingTop: 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 8,
        }}
      >
        <SectionTitle>{t("ads.title")}</SectionTitle>

        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          {t("ads.description")}
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
            {t("ads.title")}
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
              {t("ads.newForm")}
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
                  {t("ads.noneYet")}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </ScreenShell>
  );
}
