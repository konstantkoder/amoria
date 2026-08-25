import React from "react";
import {
  Alert,
  BackHandler,
  Image,
  Keyboard,
  Platform,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import ScreenShell from "@/components/ScreenShell";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import { goBackOrOpenAnnouncements } from "@/navigation/nearbyNavigation";
import * as announcementsApi from "@/services/api/announcementsApi";
import * as uploadsApi from "@/services/api/uploadsApi";
import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  type NearbyAnnouncementCategory,
  mapAnnouncementDtoToNearbyAnnouncement,
} from "@/services/announcementsModel";
import { uploadFileToPresignedPut } from "@/services/media/uploadPut";
import { containsUnsafeAnnouncementContent } from "@/services/safetyContent";
import { theme } from "@/theme";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string
) {
  return t(key);
}

function getPublishErrorCopy(
  t: (key: string, params?: Record<string, string>) => string,
  error: unknown
) {
  const message = String((error as { message?: string } | null)?.message ?? "");
  if (
    message.includes("announcements.photo") ||
    message.includes("media.uploadPutFailed") ||
    message.includes("photos.readFailed") ||
    message.includes("photos.sizeRequired")
  ) {
    return {
      title: copyOrFallback(
        t, "nearby.create.photoUploadErrorTitle"
      ),
      body: copyOrFallback(
        t, "nearby.create.photoUploadErrorBody"
      ),
    };
  }

  return {
    title: copyOrFallback(t, "nearby.create.errorTitle"),
    body: copyOrFallback(
      t, "nearby.create.errorBody"
    ),
  };
}

function inferImageContentType(uri: string) {
  const normalized = String(uri ?? "").split("?")[0].toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".heic")) return "image/heic";
  if (normalized.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

function normalizeImageMimeType(value: unknown, uri: string) {
  const mimeType = String(value ?? "").trim().toLowerCase();
  return mimeType.startsWith("image/") ? mimeType : inferImageContentType(uri);
}

async function uploadAnnouncementPhoto(fileUri: string, mimeType?: string) {
  const stableUri = String(fileUri ?? "").trim();
  if (!stableUri) {
    throw new Error("photos.uriRequired");
  }

  const fileInfo = await FileSystem.getInfoAsync(stableUri);
  if (!fileInfo.exists) {
    throw new Error("photos.readFailed");
  }

  const sizeBytes = Number(fileInfo.size ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("photos.sizeRequired");
  }

  const upload = await uploadsApi.prepareUpload({
    purpose: "announcement_photo",
    mimeType: normalizeImageMimeType(mimeType, stableUri),
    sizeBytes,
  });

  await uploadFileToPresignedPut(upload.uploadUrl, stableUri, upload.headers);

  const completed = await uploadsApi.completeUpload(upload.uploadId, {
    sizeBytes,
  });
  const mediaId = String(completed.media.id ?? completed.media.mediaId ?? "").trim();
  if (!mediaId) {
    throw new Error("announcements.photoInvalidMedia");
  }

  return mediaId;
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
  const [photoMimeType, setPhotoMimeType] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [category, setCategory] = React.useState<NearbyAnnouncementCategory>("walk");
  const currentUid = authUser?.id ?? "";
  const authorDisplayName = authUser?.displayName?.trim() ?? "";
  const authorLabel =
    authorDisplayName || copyOrFallback(t, "profile.amoriaUser");

  const categoryLabels = React.useMemo(
    () => ({
      walk: copyOrFallback(t, "nearby.announcements.category.walk"),
      trip: copyOrFallback(t, "nearby.announcements.category.trip"),
      coffee: copyOrFallback(t, "nearby.announcements.category.coffee"),
      activity: copyOrFallback(t, "nearby.announcements.category.activity"),
      sport: copyOrFallback(t, "nearby.announcements.category.sport"),
      ride: copyOrFallback(t, "nearby.announcements.category.ride"),
    }),
    [t]
  );
  const fallbackPlaceLabel = copyOrFallback(
    t, "nearby.placeFallback"
  );
  const trimmedPlaceLabel = placeLabel.trim();
  const previewTitle =
    title.trim() ||
    copyOrFallback(t, "nearby.create.previewTitleFallback");
  const previewBody =
    description.trim() ||
    copyOrFallback(
      t, "nearby.create.previewBodyFallback"
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
    setPhotoMimeType("");
    Alert.alert(
      copyOrFallback(t, "photos.previewFailed"),
      copyOrFallback(
        t, "photos.noAssetReturned"
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
    let status = "granted";
    if (Platform.OS === "ios") {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = permission.status;
      } catch {
        Alert.alert(
          copyOrFallback(t, "photos.pickFailed"),
          copyOrFallback(
            t, "photos.permissionBody"
          )
        );
        return;
      }
    }

    if (status !== "granted") {
      Alert.alert(
        copyOrFallback(t, "photos.permissionTitle"),
        copyOrFallback(
          t, "photos.permissionBody"
        )
      );
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.65,
        allowsEditing: false,
        mediaTypes: ["images"],
        selectionLimit: 1,
      });
    } catch {
      Alert.alert(
        copyOrFallback(t, "photos.pickFailed"),
        copyOrFallback(
          t, "photos.noAssetReturned"
        )
      );
      return;
    }

    if (result.canceled) return;
    const asset = result.assets?.[0];
    const nextUri = asset?.uri?.trim() ?? "";
    if (!asset || !nextUri) {
      Alert.alert(
        copyOrFallback(t, "photos.pickFailed"),
        copyOrFallback(
          t, "photos.noAssetReturned"
        )
      );
      return;
    }

    pendingPhotoRevealRef.current = true;
    photoPreviewErrorShownRef.current = false;
    setPhotoMimeType(asset.mimeType ?? "");
    setPhotoUri(nextUri);
  }, [saving, t]);

  const publish = React.useCallback(async () => {
    if (!currentUid) {
      Alert.alert(
        copyOrFallback(t, "nearby.create.signInTitle"),
        copyOrFallback(
          t, "nearby.create.signInBody"
        )
      );
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || !trimmedDescription) {
      Alert.alert(
        copyOrFallback(t, "nearby.create.fillTitle"),
        copyOrFallback(
          t, "nearby.create.fillBody"
        )
      );
      return;
    }

    if (containsUnsafeAnnouncementContent(trimmedTitle, trimmedDescription)) {
      Alert.alert(
        copyOrFallback(t, "safety.unsafeAnnouncementTitle"),
        copyOrFallback(
          t, "safety.unsafeAnnouncementBody"
        )
      );
      return;
    }

    setSaving(true);
    try {
      const publicDisplayName = authUser?.displayName?.trim();
      if (!publicDisplayName) {
        Alert.alert(
          copyOrFallback(t, "profile.completeProfile"),
          copyOrFallback(t, "profile.completeProfileBody")
        );
        return;
      }

      const photoMediaId = photoUri
        ? await uploadAnnouncementPhoto(photoUri, photoMimeType)
        : "";
      const createdAnnouncement = await announcementsApi.createAnnouncement({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        placeLabel: trimmedPlaceLabel || null,
        ...(photoMediaId ? { photoMediaId } : {}),
      });
      const initialAnnouncement =
        mapAnnouncementDtoToNearbyAnnouncement(createdAnnouncement);

      navigation.navigate("AnnouncementDetail", {
        announcementId: createdAnnouncement.id,
        ...(initialAnnouncement ? { initialAnnouncement } : {}),
      });
    } catch (error) {
      const errorCopy = getPublishErrorCopy(t, error);
      Alert.alert(errorCopy.title, errorCopy.body);
    } finally {
      setSaving(false);
    }
  }, [
    category,
    authUser?.displayName,
    trimmedPlaceLabel,
    currentUid,
    description,
    navigation,
    photoMimeType,
    photoUri,
    t,
    title,
  ]);

  return (
    <ScreenShell
      title={copyOrFallback(t, "nearby.create.title")}
      background="nearbyHarborV6"
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
            {copyOrFallback(t, "nearby.create.kicker")}
          </Text>
          <Text style={styles.introTitle}>
            {copyOrFallback(t, "nearby.create.heroTitle")}
          </Text>
          <Text style={styles.introBody}>
            {copyOrFallback(
              t, "nearby.create.heroBody"
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
              {copyOrFallback(t, "nearby.create.photoLabel")}
            </Text>
            {photoUri ? (
              <View style={styles.photoPreviewWrap}>
                <View style={styles.photoAttachedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                  <Text style={styles.photoAttachedBadgeText}>
                    {copyOrFallback(
                      t, "nearby.create.photoAttachedBadge"
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
                    t, "nearby.create.photoAttachedHint"
                  )}
                </Text>
                <View style={styles.photoActions}>
                  <Pressable
                    onPress={pickPhoto}
                    disabled={saving}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {copyOrFallback(t, "nearby.create.changePhoto")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPhotoUri("");
                      setPhotoMimeType("");
                    }}
                    disabled={saving}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {copyOrFallback(t, "nearby.create.removePhoto")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={pickPhoto} disabled={saving} style={styles.photoPlaceholder}>
                <View style={styles.photoPlaceholderIconWrap}>
                  <Ionicons name="image-outline" size={20} color={theme.colors.textAccent} />
                </View>
                <Text style={styles.photoPlaceholderTitle}>
                  {copyOrFallback(t, "nearby.create.addPhoto")}
                </Text>
                <Text style={styles.photoPlaceholderBody}>
                  {copyOrFallback(
                    t, "nearby.create.photoBody"
                  )}
                </Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.categoryLabel")}
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
            {copyOrFallback(t, "nearby.create.titleLabel")}
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={copyOrFallback(
              t, "nearby.create.titlePlaceholder"
            )}
            placeholderTextColor="rgba(226,232,255,0.46)"
            style={styles.input}
            maxLength={80}
          />

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.descriptionLabel")}
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={copyOrFallback(
              t, "nearby.create.descriptionPlaceholder"
            )}
            placeholderTextColor="rgba(226,232,255,0.46)"
            style={[styles.input, styles.textArea]}
            multiline
            textAlignVertical="top"
            maxLength={420}
          />

          <Text style={styles.label}>
            {copyOrFallback(t, "nearby.create.cityLabel")}
          </Text>
          <TextInput
            value={placeLabel}
            onChangeText={setPlaceLabel}
            placeholder={copyOrFallback(
              t, "nearby.create.cityPlaceholder"
            )}
            placeholderTextColor="rgba(226,232,255,0.46)"
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
              {copyOrFallback(t, "nearby.create.previewKicker")}
            </Text>
            {photoUri ? (
              <View style={styles.previewPhotoNotice}>
                <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                <Text style={styles.previewPhotoNoticeText}>
                  {copyOrFallback(
                    t, "nearby.create.previewPhotoNotice"
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
                      ? copyOrFallback(t, "nearby.announcements.photoYes")
                      : copyOrFallback(t, "nearby.announcements.photoNo")}
                  </Text>
                </View>
              </View>

              <View style={styles.previewFooter}>
                <Text style={styles.previewAuthor}>{authorLabel}</Text>
                <Text style={styles.previewAuthorHint}>
                  {copyOrFallback(
              t, "nearby.create.previewFooter"
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
                  ? copyOrFallback(t, "photos.uploading")
                  : copyOrFallback(t, "nearby.create.publishing")
                : copyOrFallback(t, "nearby.create.publish")}
            </Text>
          </Pressable>
          <Text style={styles.publishHint}>
            {!currentUid
              ? copyOrFallback(
                  t, "nearby.create.signInBody"
                )
              : canPublish
              ? copyOrFallback(
                  t, "nearby.create.publishReadyHint"
                )
              : copyOrFallback(
                  t, "nearby.create.publishHint"
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
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 6,
  },
  introKicker: {
    color: theme.colors.textAccent,
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
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
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
    backgroundColor: theme.colors.chipActiveBg,
    borderColor: theme.colors.chipActiveBorder,
  },
  categoryText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  categoryTextActive: {
    color: theme.colors.textAccent,
  },
  input: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  textArea: {
    minHeight: 108,
  },
  previewCard: {
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 10,
  },
  previewCardWithPhoto: {
    backgroundColor: "transparent",
  },
  previewKicker: {
    color: theme.colors.textAccent,
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
    backgroundColor: "rgba(230,185,118,0.10)",
    borderWidth: 1,
    borderColor: "rgba(230,185,118,0.18)",
  },
  previewCategoryText: {
    color: theme.colors.textAccent,
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
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  publishButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: theme.buttons.primary.backgroundColor,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.buttons.primary.borderColor,
    shadowColor: theme.colors.textAccent,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  publishButtonDisabled: {
    opacity: 0.65,
  },
  publishButtonText: {
    color: theme.buttons.primary.textColor,
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
