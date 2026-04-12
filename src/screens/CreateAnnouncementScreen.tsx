import React from "react";
import {
  Alert,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import ScreenShell from "@/components/ScreenShell";
import { auth } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  createNearbyAnnouncement,
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
  const navigation = useNavigation<any>();
  const { t } = useLocale();
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
      "A short description will appear here and explain why this announcement matters."
    );
  const previewPlace = city.trim() || fallbackPlaceLabel;

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
      quality: 0.8,
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled) return;
    setPhotoUri(result.assets[0]?.uri ?? "");
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
      await createNearbyAnnouncement({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        city,
        authorLabel,
        ...(photoUri ? { photoUri } : {}),
      });

      Alert.alert(
        copyOrFallback(t, "nearby.create.successTitle", "Объявление готово"),
        copyOrFallback(
          t,
          "nearby.create.successBody",
          "Оно уже добавлено в Nearby и доступно в разделе «Объявления»."
        )
      );

      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }

      navigation.navigate("Tabs", {
        screen: "Nearby",
        params: { section: "announcements" },
      });
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
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <Text style={styles.introKicker}>
            {copyOrFallback(t, "nearby.create.kicker", "Новый локальный пост")}
          </Text>
          <Text style={styles.introTitle}>
            {copyOrFallback(t, "nearby.create.heroTitle", "Собери понятное объявление без перегруза")}
          </Text>
          <Text style={styles.introBody}>
            {copyOrFallback(
              t,
              "nearby.create.heroBody",
              "Фото можно добавить, но это не обязательно. Главное — коротко объяснить, что ты ищешь и где это актуально."
            )}
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.photoLabel", "Фото")}
          </Text>
          {photoUri ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
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

        <View style={styles.previewCard}>
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
                    <Ionicons name="location-outline" size={13} color={theme.colors.subtext} />
                    <Text style={styles.previewMetaPillText}>{previewPlace}</Text>
                  </View>
                </View>
                <Text style={styles.previewTitle}>{previewTitle}</Text>
                <Text style={styles.previewBody}>{previewBody}</Text>
              </View>

              <View style={[styles.previewMediaTile, photoUri ? styles.previewMediaTileActive : null]}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.previewMediaImage} />
                ) : (
                  <Ionicons name="image-outline" size={20} color={theme.colors.subtext} />
                )}
                <Text style={styles.previewMediaText}>
                  {photoUri
                    ? copyOrFallback(t, "nearby.announcements.photoYes", "With photo")
                    : copyOrFallback(t, "nearby.announcements.photoNo", "No photo")}
                </Text>
              </View>
            </View>

            <View style={styles.previewFooter}>
              <Text style={styles.previewAuthor}>{authorLabel}</Text>
              <Text style={styles.previewAuthorHint}>
                {copyOrFallback(t, "nearby.create.previewFooter", "Появится в Nearby → Объявления")}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.publishCard}>
          <Pressable
            onPress={() => void publish()}
            disabled={saving}
            style={[styles.publishButton, saving ? styles.publishButtonDisabled : null]}
          >
            <Text style={styles.publishButtonText}>
              {saving
                ? copyOrFallback(t, "common.saving", "Сохранение...")
                : copyOrFallback(t, "nearby.create.publish", "Опубликовать объявление")}
            </Text>
          </Pressable>
          <Text style={styles.publishHint}>
            {copyOrFallback(
              t,
              "nearby.create.publishHint",
              "После публикации объявление сразу появится в Nearby."
            )}
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  introCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 6,
  },
  introKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  introTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
  },
  introBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(12, 16, 30, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
  photoPlaceholder: {
    borderRadius: theme.shapes.cardInner,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    gap: 6,
  },
  photoPlaceholderIcon: {
    color: theme.colors.accent,
    fontSize: 28,
    lineHeight: 30,
  },
  photoPlaceholderTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  photoPlaceholderBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  photoPreviewWrap: {
    gap: 10,
  },
  photoPreview: {
    width: "100%",
    height: 180,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryRow: {
    paddingRight: 4,
    gap: 8,
  },
  categoryChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 12,
    fontWeight: "700",
  },
  categoryTextActive: {
    color: theme.colors.accent,
  },
  input: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    color: theme.colors.text,
    fontSize: 14,
  },
  textArea: {
    minHeight: 120,
  },
  previewCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(20, 18, 35, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  previewKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  previewListing: {
    gap: 12,
  },
  previewTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  previewCopy: {
    flex: 1,
    gap: 8,
  },
  previewMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewCategoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
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
    gap: 6,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
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
    fontSize: 18,
    fontWeight: "800",
  },
  previewBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  previewMediaTile: {
    width: 86,
    minHeight: 86,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 6,
  },
  previewMediaTileActive: {
    backgroundColor: "rgba(255,122,60,0.08)",
    borderColor: "rgba(255,122,60,0.18)",
  },
  previewMediaImage: {
    width: "100%",
    height: 50,
    borderRadius: 12,
  },
  previewMediaText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  previewFooter: {
    gap: 3,
  },
  previewAuthor: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  previewAuthorHint: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  publishCard: {
    gap: 8,
  },
  publishButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
