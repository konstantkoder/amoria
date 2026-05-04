import React from "react";
import {
  Alert,
  BackHandler,
  Image,
  Keyboard,
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
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import {
  goBackOrOpenAnnouncements,
  openAnnouncements,
} from "@/navigation/nearbyNavigation";
import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  nearbyAnnouncementsRepository,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";
import { containsUnsafeAnnouncementContent } from "@/services/safety";
import { getUserProfile } from "@/services/user";
import { theme } from "@/theme";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

function getPublishErrorCopy(
  t: (key: string, params?: Record<string, string>) => string,
  error: unknown
) {
  const message = String((error as { message?: string } | null)?.message ?? "");
  if (
    message.includes("announcements.photo") ||
    message.includes("announcements.photoBackendUnavailable") ||
    message.includes("photoUploadUnavailable") ||
    message.includes("photoReadFailed")
  ) {
    return {
      title: copyOrFallback(
        t,
        "nearby.create.photoUploadErrorTitle",
        "Фото не удалось загрузить"
      ),
      body: copyOrFallback(
        t,
        "nearby.create.photoUploadErrorBody",
        "Announcements backend еще не подключен"
      ),
    };
  }

  return {
    title: copyOrFallback(t, "nearby.create.errorTitle", "Не удалось опубликовать"),
    body: copyOrFallback(
      t,
      "nearby.create.errorBody",
      "Firestore не сохранил объявление. Попробуй ещё раз чуть позже."
    ),
  };
}

export default function CreateAnnouncementScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"CreateAnnouncement">>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const scrollRef = React.useRef<ScrollView>(null);
  const photoSectionYRef = React.useRef(0);
  const previewCardYRef = React.useRef(0);
  const pendingPhotoRevealRef = React.useRef(false);
  const photoPreviewErrorShownRef = React.useRef(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [placeLabel, setPlaceLabel] = React.useState("");
  const [photoUri, setPhotoUri] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [category, setCategory] = React.useState<NearbyAnnouncementCategory>("walk");
  const [authorDisplayName, setAuthorDisplayName] = React.useState("");
  const currentUid = authUser?.id ?? "";
  const authorLabel =
    authorDisplayName || copyOrFallback(t, "profile.amoriaUser", "Пользователь Amoria");

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
  const fallbackPlaceLabel = copyOrFallback(
    t,
    "nearby.placeFallback",
    "Место не указано"
  );
  const trimmedPlaceLabel = placeLabel.trim();
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
  const previewPlace = trimmedPlaceLabel || fallbackPlaceLabel;
  const showPreview = Boolean(
    title.trim() || description.trim() || trimmedPlaceLabel || photoUri
  );
  const canPublish = Boolean(currentUid && title.trim() && description.trim());
  const handleBack = React.useCallback(() => {
    goBackOrOpenAnnouncements(navigation);
  }, [navigation]);
  const revealPreviewFeedback = React.useCallback((targetY?: number) => {
    if (!pendingPhotoRevealRef.current) return;
    pendingPhotoRevealRef.current = false;
    requestAnimationFrame(() => {
      const nextTarget =
        targetY ?? (previewCardYRef.current > 0 ? previewCardYRef.current : photoSectionYRef.current);
      scrollRef.current?.scrollTo({
        y: Math.max(nextTarget - 20, 0),
        animated: true,
      });
    });
  }, []);

  const handlePhotoPreviewError = React.useCallback(() => {
    if (photoPreviewErrorShownRef.current) return;
    photoPreviewErrorShownRef.current = true;
    setPhotoUri("");
    Alert.alert(
      copyOrFallback(t, "photos.previewFailed", "Не удалось показать фото"),
      copyOrFallback(
        t,
        "photos.noAssetReturned",
        "Не удалось получить фото. Попробуйте выбрать другое изображение."
      )
    );
  }, [t]);

  React.useEffect(() => {
    if (!photoUri || !pendingPhotoRevealRef.current || previewCardYRef.current <= 0) return;
    const timeoutId = setTimeout(() => {
      revealPreviewFeedback(previewCardYRef.current);
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [photoUri, revealPreviewFeedback]);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      if (!currentUid) {
        setAuthorDisplayName("");
        return () => {
          alive = false;
        };
      }

      void getUserProfile()
        .then((profile) => {
          if (!alive) return;
          setAuthorDisplayName(profile.displayName?.trim() ?? "");
        })
        .catch(() => {
          if (!alive) return;
          setAuthorDisplayName("");
        });

      return () => {
        alive = false;
      };
    }, [currentUid])
  );

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  const pickPhoto = React.useCallback(async () => {
    if (saving) return;
    Keyboard.dismiss();
    let status = "";
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = permission.status;
    } catch {
      Alert.alert(
        copyOrFallback(t, "photos.pickFailed", "Не удалось выбрать фото"),
        copyOrFallback(
          t,
          "photos.permissionBody",
          "Разреши доступ к фото, чтобы добавить изображение."
        )
      );
      return;
    }

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

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.65,
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        selectionLimit: 1,
      });
    } catch {
      Alert.alert(
        copyOrFallback(t, "photos.pickFailed", "Не удалось выбрать фото"),
        copyOrFallback(
          t,
          "photos.noAssetReturned",
          "Не удалось получить фото. Попробуйте выбрать другое изображение."
        )
      );
      return;
    }

    if (result.canceled) return;
    const nextUri = result.assets?.[0]?.uri?.trim() ?? "";
    if (!result.assets || result.assets.length === 0 || !nextUri) {
      Alert.alert(
        copyOrFallback(t, "photos.pickFailed", "Не удалось выбрать фото"),
        copyOrFallback(
          t,
          "photos.noAssetReturned",
          "Не удалось получить фото. Попробуйте выбрать другое изображение."
        )
      );
      return;
    }

    Alert.alert(
      copyOrFallback(
        t,
        "nearby.create.photoBackendUnavailable",
        "Announcements backend еще не подключен"
      )
    );
    pendingPhotoRevealRef.current = false;
    photoPreviewErrorShownRef.current = false;
    setPhotoUri("");
  }, [saving, t]);

  const publish = React.useCallback(async () => {
    if (!currentUid) {
      Alert.alert(
        copyOrFallback(t, "nearby.create.signInTitle", "Нужен вход"),
        copyOrFallback(
          t,
          "nearby.create.signInBody",
          "Чтобы опубликовать объявление с реальным автором и личным чатом, сначала войди в аккаунт."
        )
      );
      return;
    }

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

    if (containsUnsafeAnnouncementContent(trimmedTitle, trimmedDescription)) {
      Alert.alert(
        copyOrFallback(t, "safety.unsafeAnnouncementTitle", "Такой текст нельзя публиковать"),
        copyOrFallback(
          t,
          "safety.unsafeAnnouncementBody",
          "Объявления не могут предлагать сексуальные услуги или оплатные встречи."
        )
      );
      return;
    }

    if (photoUri) {
      Alert.alert(
        copyOrFallback(
          t,
          "nearby.create.photoBackendUnavailable",
          "Announcements backend еще не подключен"
        )
      );
      return;
    }

    setSaving(true);
    try {
      const currentProfile = await getUserProfile();
      const publicDisplayName = currentProfile.displayName?.trim();
      if (!publicDisplayName) {
        Alert.alert(
          copyOrFallback(t, "profile.completeProfile", "Заполните профиль"),
          copyOrFallback(t, "profile.completeProfileBody", "Чтобы продолжить, укажите имя")
        );
        return;
      }
      const createdAnnouncement = await nearbyAnnouncementsRepository.createAnnouncement({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        placeLabel: trimmedPlaceLabel,
        authorLabel: publicDisplayName,
        authorUid: currentUid,
        ...(currentProfile.avatarUrl ? { authorAvatarUrl: currentProfile.avatarUrl } : {}),
        ...(photoUri ? { photoUri } : {}),
      });

      openAnnouncements(navigation, createdAnnouncement.id);
    } catch (error) {
      const errorCopy = getPublishErrorCopy(t, error);
      Alert.alert(errorCopy.title, errorCopy.body);
    } finally {
      setSaving(false);
    }
  }, [
    category,
    trimmedPlaceLabel,
    currentUid,
    description,
    navigation,
    photoUri,
    t,
    title,
  ]);

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
        keyboardShouldPersistTaps="handled"
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
              "Это оформленный запрос, а не быстрый статус из «Рядом». Коротко и понятно напиши, кого ищешь, где и какой формат нужен."
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
                <View style={styles.photoAttachedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                  <Text style={styles.photoAttachedBadgeText}>
                    {copyOrFallback(
                      t,
                      "nearby.create.photoAttachedBadge",
                      "Фото прикреплено"
                    )}
                  </Text>
                </View>
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoPreview}
                  onError={handlePhotoPreviewError}
                />
                <Text style={styles.photoAttachedHint}>
                  {copyOrFallback(
                    t,
                    "nearby.create.photoAttachedHint",
                    "Announcements backend еще не подключен"
                  )}
                </Text>
                <View style={styles.photoActions}>
                  <Pressable
                    onPress={pickPhoto}
                    disabled={saving}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {copyOrFallback(t, "nearby.create.changePhoto", "Заменить фото")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPhotoUri("")}
                    disabled={saving}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {copyOrFallback(t, "nearby.create.removePhoto", "Убрать фото")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} disabled={saving} style={styles.photoPlaceholder}>
                <View style={styles.photoPlaceholderIconWrap}>
                  <Ionicons name="image-outline" size={20} color={theme.colors.accent} />
                </View>
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
            value={placeLabel}
            onChangeText={setPlaceLabel}
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

        {showPreview ? (
          <View
            style={[styles.previewCard, photoUri ? styles.previewCardWithPhoto : null]}
            onLayout={(event) => {
              previewCardYRef.current = event.nativeEvent.layout.y;
              if (!pendingPhotoRevealRef.current || !photoUri) return;
              revealPreviewFeedback(event.nativeEvent.layout.y);
            }}
          >
            <Text style={styles.previewKicker}>
              {copyOrFallback(t, "nearby.create.previewKicker", "Как это будет выглядеть")}
            </Text>
            {photoUri ? (
              <View style={styles.previewPhotoNotice}>
                <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                <Text style={styles.previewPhotoNoticeText}>
                  {copyOrFallback(
                    t,
                    "nearby.create.previewPhotoNotice",
                    "Фото выбрано для объявления. Публикация продолжится только после успешной загрузки."
                  )}
                </Text>
              </View>
            ) : null}
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
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.previewMediaImage}
                      onError={handlePhotoPreviewError}
                    />
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
              "После публикации карточка появится в разделе «Объявления» и откроется как обычная запись."
                  )}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

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
                ? photoUri
                  ? copyOrFallback(t, "photos.uploading", "Фото загружается...")
                  : copyOrFallback(t, "nearby.create.publishing", "Публикуем...")
                : copyOrFallback(t, "nearby.create.publish", "Опубликовать объявление")}
            </Text>
          </Pressable>
          <Text style={styles.publishHint}>
            {!currentUid
              ? copyOrFallback(
                  t,
                  "nearby.create.signInBody",
                  "Чтобы опубликовать объявление с реальным автором и личным чатом, сначала войди в аккаунт."
                )
              : canPublish
              ? copyOrFallback(
                  t,
                  "nearby.create.publishReadyHint",
                  "После успешной записи в Firestore вернёшься в раздел «Объявления», где карточка появится в общем списке."
                )
              : copyOrFallback(
                  t,
                  "nearby.create.publishHint",
                  "Заполни заголовок и описание. Ниже видно, как объявление будет выглядеть в разделе."
                )}
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
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
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(12, 16, 30, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  label: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  photoPlaceholder: {
    borderRadius: theme.shapes.cardInner,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    gap: 8,
  },
  photoPlaceholderIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,122,60,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,122,60,0.2)",
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
    borderRadius: theme.shapes.cardInner,
    padding: 10,
    backgroundColor: "rgba(255,122,60,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,122,60,0.18)",
    gap: 8,
  },
  photoAttachedBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(70,224,200,0.12)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.22)",
  },
  photoAttachedBadgeText: {
    color: "#D8FFF6",
    fontSize: 11,
    fontWeight: "800",
  },
  photoAttachedHint: {
    color: theme.colors.subtext,
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
    padding: 16,
    backgroundColor: "rgba(20, 18, 35, 0.84)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  previewCardWithPhoto: {
    borderColor: "rgba(255,122,60,0.2)",
    backgroundColor: "rgba(28, 18, 24, 0.84)",
  },
  previewKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  previewPhotoNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(70,224,200,0.10)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.20)",
  },
  previewPhotoNoticeText: {
    flex: 1,
    color: "#D7FFF6",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
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
    lineHeight: 19,
  },
  previewMediaTile: {
    width: 74,
    minHeight: 82,
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
    height: 50,
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
    lineHeight: 16,
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
    gap: 8,
    padding: 16,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(15, 18, 34, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  publishButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
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
    lineHeight: 18,
    textAlign: "left",
  },
});
