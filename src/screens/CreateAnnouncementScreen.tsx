import React from "react";
import {
  Alert,
  BackHandler,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import ScreenShell from "@/components/ScreenShell";
import { auth } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import {
  goBackOrOpenNearbyAnnouncements,
  openNearbyAnnouncements,
} from "@/navigation/nearbyNavigation";
import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  nearbyAnnouncementsRepository,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";
import { formatNickname } from "@/utils/nickname";
import { translateMaybeKey } from "@/utils/i18n";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function CreateAnnouncementScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"CreateAnnouncement">>();
  const { t } = useLocale();
  const scrollRef = React.useRef<ScrollView>(null);
  const photoSectionYRef = React.useRef(0);
  const previewCardYRef = React.useRef(0);
  const pendingPhotoRevealRef = React.useRef(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [city, setCity] = React.useState("");
  const [photoUri, setPhotoUri] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [category, setCategory] = React.useState<NearbyAnnouncementCategory>("walk");

  const authorCode = auth?.currentUser?.uid ? makeNickname(auth.currentUser.uid) : "common.user";
  const formattedAuthor = formatNickname(authorCode, t);
  const authorLabel =
    formattedAuthor === authorCode
      ? translateMaybeKey(authorCode, t, ["common."])
      : formattedAuthor;

  const categoryLabels = React.useMemo(
    () => ({
      walk: copyOrFallback(t, "nearby.announcements.category.walk", "Прогулка"),
      trip: copyOrFallback(t, "nearby.announcements.category.trip", "Поездка"),
      coffee: copyOrFallback(t, "nearby.announcements.category.coffee", "Кофе"),
      activity: copyOrFallback(t, "nearby.announcements.category.activity", "Активность"),
      sport: copyOrFallback(t, "nearby.announcements.category.sport", "Спорт"),
      ride: copyOrFallback(t, "nearby.announcements.category.ride", "Вместе по пути"),
    }),
    [t]
  );
  const fallbackPlaceLabel = copyOrFallback(t, "tabs.nearby", "Nearby");
  const previewTitle =
    title.trim() ||
    copyOrFallback(t, "nearby.create.previewTitleFallback", "Announcement title");
  const previewBody =
    description.trim() ||
    copyOrFallback(
      t,
      "nearby.create.previewBodyFallback",
      "Здесь будет видно, кого ты ищешь, где это актуально и зачем откликаться."
    );
  const previewPlace = city.trim() || fallbackPlaceLabel;
  const showPreview = Boolean(title.trim() || description.trim() || city.trim() || photoUri);
  const canPublish = Boolean(title.trim() && description.trim());
  const handleBack = React.useCallback(() => {
    goBackOrOpenNearbyAnnouncements(navigation);
  }, [navigation]);
  const revealPhotoFeedback = React.useCallback(() => {
    const targetY =
      previewCardYRef.current > 0 ? previewCardYRef.current : photoSectionYRef.current;
    scrollRef.current?.scrollTo({
      y: Math.max(targetY - 16, 0),
      animated: true,
    });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  React.useEffect(() => {
    if (!photoUri || !pendingPhotoRevealRef.current) return;
    pendingPhotoRevealRef.current = false;
    const timeoutId = setTimeout(() => {
      revealPhotoFeedback();
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [photoUri, revealPhotoFeedback]);

  const pickPhoto = React.useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        copyOrFallback(t, "photos.permissionTitle", "Нужен доступ к галерее"),
        copyOrFallback(
          t,
          "photos.permissionBody",
          "Разреши доступ к фото, чтобы добавить изображение к объявлению."
        )
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.65,
      allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      selectionLimit: 1,
    });
    if (result.canceled) return;
    const nextUri = result.assets[0]?.uri ?? "";
    if (!nextUri) return;
    pendingPhotoRevealRef.current = true;
    setPhotoUri(nextUri);
  }, [t]);

  const publish = React.useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || !trimmedDescription) {
      Alert.alert(
        copyOrFallback(t, "nearby.create.fillTitle", "Нужно заполнить объявление"),
        copyOrFallback(
          t,
          "nearby.create.fillBody",
          "Добавь заголовок и короткое описание, чтобы объявление выглядело понятным."
        )
      );
      return;
    }

    setSaving(true);
    try {
      const createdAnnouncement = await nearbyAnnouncementsRepository.createAnnouncement({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        city,
        authorLabel,
        ...(auth?.currentUser?.uid ? { authorUid: auth.currentUser.uid } : {}),
        ...(photoUri ? { photoUri } : {}),
      });

      openNearbyAnnouncements(navigation, createdAnnouncement.id);
    } catch {
      Alert.alert(
        copyOrFallback(t, "nearby.create.errorTitle", "Не удалось опубликовать"),
        copyOrFallback(
          t,
          "nearby.create.errorBody",
          "Попробуй ещё раз чуть позже."
        )
      );
    } finally {
      setSaving(false);
    }
  }, [authorLabel, category, city, description, navigation, photoUri, t, title]);

  return (
    <ScreenShell
      title={copyOrFallback(t, "nearby.create.title", "Создать объявление")}
      background="ads"
      showBack
      onBack={handleBack}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <Text style={styles.introKicker}>
            {copyOrFallback(t, "nearby.create.kicker", "Оформленный запрос")}
          </Text>
          <Text style={styles.introTitle}>
            {copyOrFallback(t, "nearby.create.heroTitle", "Опубликуй понятное объявление")}
          </Text>
          <Text style={styles.introBody}>
            {copyOrFallback(
              t,
              "nearby.create.heroBody",
              "Это не моментный статус. Коротко и ясно напиши, кого ищешь, где и ради чего встречаетесь."
            )}
          </Text>
        </View>

        <View style={styles.formCard}>
          <View
            onLayout={(event) => {
              photoSectionYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>
              {copyOrFallback(t, "nearby.create.photoLabel", "Фото")}
            </Text>
            {photoUri ? (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <Text style={styles.photoAttachedHint}>
                  {copyOrFallback(
                    t,
                    "nearby.create.photoAttachedHint",
                    "Фото прикрепилось. Ниже можно сразу проверить preview объявления."
                  )}
                </Text>
                <View style={styles.photoActions}>
                  <Pressable onPress={pickPhoto} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      {copyOrFallback(t, "nearby.create.changePhoto", "Заменить фото")}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setPhotoUri("")} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>
                      {copyOrFallback(t, "nearby.create.removePhoto", "Убрать фото")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>＋</Text>
                <Text style={styles.photoPlaceholderTitle}>
                  {copyOrFallback(t, "nearby.create.addPhoto", "Добавить фото")}
                </Text>
                <Text style={styles.photoPlaceholderBody}>
                  {copyOrFallback(
                    t,
                    "nearby.create.photoBody",
                    "Опционально. Объявление всё равно можно опубликовать без изображения."
                  )}
                </Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.categoryLabel", "Категория")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.map((item) => {
              const active = item === category;
              return (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.categoryChip, active ? styles.categoryChipActive : null]}
                >
                  <Text style={[styles.categoryText, active ? styles.categoryTextActive : null]}>
                    {categoryLabels[item]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.titleLabel", "Заголовок")}
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={copyOrFallback(
              t,
              "nearby.create.titlePlaceholder",
              "Например: Прогулка вечером по центру"
            )}
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            maxLength={80}
          />

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.descriptionLabel", "Описание")}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={copyOrFallback(
              t,
              "nearby.create.descriptionPlaceholder",
              "Что за план, кого ищешь и почему это звучит хорошо именно сейчас?"
            )}
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, styles.textArea]}
            multiline
            textAlignVertical="top"
            maxLength={420}
          />

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.cityLabel", "Город или район")}
          </Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder={copyOrFallback(
              t,
              "nearby.create.cityPlaceholder",
              "Например: Центр, Варшава или Mokotow"
            )}
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            maxLength={60}
          />
        </View>

        <View style={styles.publishCard}>
          <Pressable
            onPress={() => void publish()}
            disabled={!canPublish || saving}
            style={[
              styles.publishButton,
              !canPublish || saving ? styles.publishButtonDisabled : null,
            ]}
          >
            <Text style={styles.publishButtonText}>
              {saving
                ? copyOrFallback(t, "common.saving", "Сохранение...")
                : copyOrFallback(t, "nearby.create.publish", "Опубликовать объявление")}
            </Text>
          </Pressable>
          <Text style={styles.publishHint}>
            {canPublish
              ? copyOrFallback(
                  t,
                  "nearby.create.publishHint",
                  "После публикации объявление сразу появится в Nearby → Объявления как оформленный запрос."
                )
              : copyOrFallback(
                  t,
                  "nearby.create.fillBody",
                  "Добавь заголовок и короткое описание, чтобы было ясно, кого и для чего ты ищешь."
                )}
          </Text>
        </View>

        {showPreview ? (
          <View
            style={styles.previewCard}
            onLayout={(event) => {
              previewCardYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.previewKicker}>
              {copyOrFallback(t, "nearby.create.previewKicker", "Как это увидят рядом")}
            </Text>
            <View style={styles.previewListing}>
              <View style={styles.previewTop}>
                <View style={styles.previewCopy}>
                  <View style={styles.previewMetaRow}>
                    <View style={styles.previewCategoryPill}>
                      <Text style={styles.previewCategoryText}>{categoryLabels[category]}</Text>
                    </View>
                    <View style={styles.previewMetaPill}>
                      <Ionicons name="person-outline" size={13} color={theme.colors.subtext} />
                      <Text style={styles.previewMetaPillText}>{authorLabel}</Text>
                    </View>
                    <View style={styles.previewMetaPill}>
                      <Ionicons name="location-outline" size={13} color={theme.colors.subtext} />
                      <Text style={styles.previewMetaPillText}>{previewPlace}</Text>
                    </View>
                  </View>
                  <Text style={styles.previewTitle}>{previewTitle}</Text>
                  <Text style={styles.previewBody}>{previewBody}</Text>
                </View>

                <View
                  style={[styles.previewMediaTile, photoUri ? styles.previewMediaTileActive : null]}
                >
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.previewMediaImage} />
                  ) : (
                    <Ionicons name="image-outline" size={18} color={theme.colors.subtext} />
                  )}
                  <Text style={styles.previewMediaText}>
                    {photoUri
                      ? copyOrFallback(t, "nearby.announcements.photoYes", "С фото")
                      : copyOrFallback(t, "nearby.announcements.photoNo", "Без фото")}
                  </Text>
                </View>
              </View>

              <View style={styles.previewFooter}>
                <Text style={styles.previewAuthor}>{authorLabel}</Text>
                <Text style={styles.previewAuthorHint}>
                  {copyOrFallback(
                    t,
                    "nearby.create.previewFooter",
                    "Появится в Nearby → Объявления как оформленный запрос"
                  )}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
    paddingBottom: 32,
    gap: 14,
  },
  introCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(17, 20, 36, 0.82)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  introKicker: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  introTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  introBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  formCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(12, 16, 30, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  photoPlaceholder: {
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    gap: 5,
  },
  photoPlaceholderIcon: {
    color: theme.colors.accent,
    fontSize: 26,
    lineHeight: 28,
  },
  photoPlaceholderTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  photoPlaceholderBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  photoPreviewWrap: {
    gap: 8,
  },
  photoAttachedHint: {
    color: theme.colors.accent,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  photoPreview: {
    width: "100%",
    height: 168,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryRow: {
    paddingRight: 4,
    gap: 6,
  },
  categoryChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  categoryChipActive: {
    backgroundColor: "rgba(255,122,60,0.18)",
    borderColor: "rgba(255,122,60,0.26)",
  },
  categoryText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  categoryTextActive: {
    color: theme.colors.accent,
  },
  input: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    color: theme.colors.text,
    fontSize: 13,
  },
  textArea: {
    minHeight: 108,
  },
  previewCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(20, 18, 35, 0.78)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  previewKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  previewListing: {
    gap: 10,
  },
  previewTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  previewCopy: {
    flex: 1,
    gap: 6,
  },
  previewMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  previewCategoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 78, 138, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.22)",
  },
  previewCategoryText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  previewMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  previewMetaPillText: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "700",
  },
  previewTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  previewBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  previewMediaTile: {
    width: 74,
    minHeight: 74,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
    gap: 5,
  },
  previewMediaTileActive: {
    backgroundColor: "rgba(255,122,60,0.08)",
    borderColor: "rgba(255,122,60,0.18)",
  },
  previewMediaImage: {
    width: "100%",
    height: 42,
    borderRadius: 12,
  },
  previewMediaText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  previewFooter: {
    gap: 2,
  },
  previewAuthor: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  previewAuthorHint: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  publishCard: {
    gap: 7,
    paddingTop: 2,
  },
  publishButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  publishButtonDisabled: {
    opacity: 0.65,
  },
  publishButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  publishHint: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
