import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ImageCropper, {
  CroppedMediaPreview,
  type NormalizedMediaCrop,
} from "@/components/media/ImageCropper";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import { useLocale } from "@/contexts/LocaleContext";
import type { Goal, Mood, UserProfile } from "@/models/User";
import type { ProfileStackParamList } from "@/navigation/appRoutes";
import {
  UploadFlowError,
  getUriScheme,
  uploadUserAvatar,
} from "@/services/storage";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import {
  getDisplayNameValidationErrorKey,
  getUserProfile,
  normalizeDisplayNameInput,
  updateUserAvatarUrl,
  updateUserDisplayName,
} from "@/services/user";
import { theme } from "@/theme";

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, "ProfileMain">;
type PendingAvatar = {
  uri: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  crop: NormalizedMediaCrop;
};
type AvatarForCrop = Omit<PendingAvatar, "crop">;

const GOAL_LABEL_KEYS: Record<Goal, string> = {
  relationship: "profile.goal.relationship",
  dating: "profile.goal.dating",
  friendship: "profile.goal.friendship",
  chat: "profile.goal.chat",
  unsure: "profile.goal.unsure",
};

const MOOD_LABEL_KEYS: Record<Mood, string> = {
  romantic: "profile.mood.romantic",
  playful: "profile.mood.playful",
  chill: "profile.mood.chill",
  curious: "profile.mood.curious",
  adventurous: "profile.mood.adventurous",
};

const GOAL_LABEL_FALLBACKS: Record<Goal, string> = {
  relationship: "Relationship",
  dating: "Dating",
  friendship: "Friendship",
  chat: "Chat",
  unsure: "Not sure yet",
};

const MOOD_LABEL_FALLBACKS: Record<Mood, string> = {
  romantic: "Romantic",
  playful: "Playful",
  chill: "Chill",
  curious: "Curious",
  adventurous: "Adventurous",
};

function isValidCrop(crop: NormalizedMediaCrop) {
  return (
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1.000001 &&
    crop.y + crop.height <= 1.000001
  );
}

function translatedOptionLabel(
  t: (key: string) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const { t } = useLocale();
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [pendingAvatar, setPendingAvatar] = React.useState<PendingAvatar | null>(null);
  const [croppingAvatar, setCroppingAvatar] = React.useState<AvatarForCrop | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState("");
  const nameInputRef = React.useRef<TextInput>(null);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);

      void getUserProfile()
        .then((nextProfile) => {
          if (!active) return;
          setProfile(nextProfile);
          setNameDraft(nextProfile.displayName ?? "");
          setNameError("");
        })
        .catch(() => {
          if (active) {
            setProfile(null);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [])
  );

  const photos = profile?.photos ?? [];
  const avatarUrl = profile?.avatarUrl ?? "";
  const avatarPreviewUri = pendingAvatar?.uri ?? "";
  const goalLabel = profile?.goal
    ? translatedOptionLabel(t, GOAL_LABEL_KEYS[profile.goal], GOAL_LABEL_FALLBACKS[profile.goal])
    : t("profile.goal.unknown");
  const moodLabel = profile?.mood
    ? translatedOptionLabel(t, MOOD_LABEL_KEYS[profile.mood], MOOD_LABEL_FALLBACKS[profile.mood])
    : t("profile.mood.unknown");
  const about = profile?.about?.trim() ? profile.about : t("profile.noDescription");
  const displayName = profile?.displayName || t("profile.amoriaUser");
  const amoriaId = profile?.amoriaId ?? "";
  const needsName = Boolean(getDisplayNameValidationErrorKey(profile?.displayName ?? ""));

  const saveDisplayName = React.useCallback(async () => {
    const nextName = normalizeDisplayNameInput(nameDraft);
    const errorKey = getDisplayNameValidationErrorKey(nextName);
    if (errorKey) {
      setNameError(t(errorKey));
      return;
    }

    setNameSaving(true);
    setNameError("");
    try {
      const nextProfile = await updateUserDisplayName(nextName);
      setProfile(nextProfile);
      setNameDraft(nextProfile.displayName ?? "");
      nameInputRef.current?.blur();
      Keyboard.dismiss();
      Alert.alert(t("common.done"), t("profile.nameUpdated"));
    } catch {
      setNameError(t("profile.nameUpdateFailed"));
    } finally {
      setNameSaving(false);
    }
  }, [nameDraft, t]);

  const pickAvatar = React.useCallback(async () => {
    let status = "";
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = permission.status;
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "ProfileScreen",
        action: "pickPhoto",
        step: "pickerFailed",
        message: safeError.message,
        code: safeError.code,
        stack: safeError.stack,
        metadata: { permissionStatus: status || "unknown" },
      });
      Alert.alert(t("photos.pickFailed"), t("photos.permissionBody"));
      return;
    }

    if (status !== "granted") {
      Alert.alert(t("photos.permissionTitle"), t("photos.permissionBody"));
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8,
        allowsEditing: false,
        mediaTypes: ["images"],
        selectionLimit: 1,
      });
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "ProfileScreen",
        action: "pickPhoto",
        step: "pickerFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: { permissionStatus: status || "unknown" },
      });
      Alert.alert(t("photos.pickFailed"), t("photos.noAssetReturned"));
      return;
    }

    if (result.canceled) {
      return;
    }

    const asset = result.assets?.[0];
    const uri = asset?.uri?.trim() ?? "";
    if (!asset || !uri) {
      Alert.alert(t("photos.pickFailed"), t("photos.noAssetReturned"));
      return;
    }

    setCroppingAvatar({
      uri,
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      ...(typeof asset.fileSize === "number" ? { fileSize: asset.fileSize } : {}),
      ...(typeof asset.width === "number" ? { width: asset.width } : {}),
      ...(typeof asset.height === "number" ? { height: asset.height } : {}),
    });
  }, [t]);

  const confirmAvatarCrop = React.useCallback((crop: NormalizedMediaCrop) => {
    if (!croppingAvatar) return;
    if (!isValidCrop(crop)) {
      reportAvatarCropError("cropInvalid", undefined, { cropRatio: 0 });
      Alert.alert(t("photos.cropFailedTitle"), t("photos.cropFailedBody"));
      return;
    }

    setPendingAvatar({
      ...croppingAvatar,
      crop,
    });
    setCroppingAvatar(null);
  }, [croppingAvatar, t]);

  const cancelAvatarCrop = React.useCallback(() => {
    setCroppingAvatar(null);
  }, []);

  const chooseAnotherAvatarForCrop = React.useCallback(async () => {
    setCroppingAvatar(null);
    await pickAvatar();
  }, [pickAvatar]);

  const confirmAvatarUpload = React.useCallback(async () => {
    if (!pendingAvatar || avatarUploading) return;

    setAvatarUploading(true);
    try {
      let currentProfile = profile;
      if (!currentProfile) {
        try {
          currentProfile = await getUserProfile();
        } catch {
          Alert.alert(t("photos.saveFailed"), t("photos.uploadErrorBody"));
          return;
        }
      }

      let avatarDownloadUrl = "";
      try {
        avatarDownloadUrl = await uploadUserAvatar(currentProfile.id, pendingAvatar.uri, {
          ...(pendingAvatar.mimeType ? { mimeType: pendingAvatar.mimeType } : {}),
          crop: pendingAvatar.crop,
        });
      } catch (error) {
        reportAvatarUploadError(error, {
          uri: pendingAvatar.uri,
          mimeType: pendingAvatar.mimeType,
          fileSize: pendingAvatar.fileSize,
        });
        if (error instanceof Error && error.message === "photos.unsupportedImageType") {
          Alert.alert(t("photos.unsupportedImageTypeTitle"), t("photos.unsupportedImageTypeBody"));
          return;
        }
        Alert.alert(t("photos.uploadFailed"), t("photos.avatarUploadErrorBody"));
        return;
      }

      const nextProfile = await updateUserAvatarUrl(avatarDownloadUrl);
      setProfile(nextProfile);
      setPendingAvatar(null);
      Alert.alert(t("common.done"), t("photos.photoUpdated"));
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      void reportClientError({
        screen: "ProfileScreen",
        action: "confirmUpload",
        step: "avatarUploadFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          hasPendingPhotoUri: Boolean(pendingAvatar?.uri),
          ...(pendingAvatar?.mimeType ? { mimeType: pendingAvatar.mimeType } : {}),
          ...(typeof pendingAvatar?.fileSize === "number" ? { fileSize: pendingAvatar.fileSize } : {}),
          ...(pendingAvatar?.uri && getUriScheme(pendingAvatar.uri)
            ? { uriScheme: getUriScheme(pendingAvatar.uri) }
            : {}),
        },
      });
      Alert.alert(t("photos.saveFailed"), t("photos.uploadErrorBody"));
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUploading, pendingAvatar, profile, t]);

  function reportAvatarUploadError(
    error: unknown,
    input: {
      uri: string;
      mimeType?: string;
      fileSize?: number;
    }
  ) {
    const safeError = sanitizeErrorForReport(error);
    const uploadError = error instanceof UploadFlowError ? error : null;

    void reportClientError({
      screen: "ProfileScreen",
      action: "confirmUpload",
      step: "avatarUploadFailed",
      code: uploadError?.code ?? safeError.code,
      message: safeError.message,
      stack: safeError.stack,
      metadata: {
        hasPendingPhotoUri: Boolean(input.uri),
        ...(uploadError?.step ? { uploadStep: uploadError.step } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(typeof input.fileSize === "number" ? { fileSize: input.fileSize } : {}),
        ...(getUriScheme(input.uri) ? { uriScheme: getUriScheme(input.uri) } : {}),
        ...(uploadError?.status ? { status: uploadError.status } : {}),
        ...(uploadError?.safeMetadata ?? {}),
      },
    });
  }

  function reportAvatarCropError(
    step: "cropOpenFailed" | "cropConfirmFailed" | "cropInvalid",
    error?: unknown,
    metadata: Record<string, unknown> = {}
  ) {
    const safeError = error ? sanitizeErrorForReport(error) : null;
    void reportClientError({
      screen: "ProfileScreen",
      action: "cropPhoto",
      step,
      code: safeError?.code,
      message: safeError?.message ?? step,
      stack: safeError?.stack,
      metadata: {
        source: "avatar",
        mimeType: croppingAvatar?.mimeType ?? pendingAvatar?.mimeType ?? null,
        ...metadata,
      },
    });
  }

  const openEditProfile = React.useCallback(
    (focus?: "about" | "goal" | "mood") => {
      try {
        if (focus) {
          navigation.navigate("EditProfile", { focus });
        } else {
          navigation.navigate("EditProfile");
        }
      } catch (error) {
        const safeError = sanitizeErrorForReport(error);
        Alert.alert(
          t("profile.editProfileOpenFailedTitle"),
          t("profile.editProfileOpenFailedBody")
        );
        reportClientError({
          screen: "ProfileScreen",
          action: "openEditProfile",
          step: "failedNavigation",
          code: safeError.code,
          message: safeError.message,
          stack: safeError.stack,
          metadata: {
            focus: focus ?? "default",
          },
        });
      }
    },
    [navigation, t]
  );

  if (loading) {
    return (
      <ScreenShell title={t("screen.profile")} background="profile" overlayOpacity={0.16}>
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>{t("editProfile.loading")}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t("screen.profile")} background="profile" overlayOpacity={0.16}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.avatarPanel}>
            <View style={[
              styles.avatarPreviewFrame,
              pendingAvatar ? styles.avatarCropFrame : null,
            ]}>
              {avatarPreviewUri ? (
                <CroppedMediaPreview
                  uri={avatarPreviewUri}
                  crop={pendingAvatar?.crop}
                  style={styles.avatarPreviewImage}
                  borderRadius={pendingAvatar ? 12 : 54}
                  onError={() => {
                    setPendingAvatar(null);
                    Alert.alert(t("photos.previewFailed"), t("photos.noAssetReturned"));
                  }}
                />
              ) : (
                <UserAvatar avatarUrl={avatarUrl} label={displayName} size={108} />
              )}
              {avatarUploading ? (
                <View style={styles.avatarUploadOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <View style={styles.avatarCopy}>
              <Text style={styles.avatarTitle}>
                {avatarUrl ? t("photos.avatarCurrent") : t("photos.avatarPlaceholder")}
              </Text>
              <Text style={styles.avatarBody}>{t("photos.avatarSharedBody")}</Text>
              {pendingAvatar ? (
                <Text style={styles.avatarBody}>{t("photos.avatarPreviewReady")}</Text>
              ) : null}
              {pendingAvatar ? (
                <View style={styles.avatarConfirmActions}>
                  <TouchableOpacity
                    style={[
                      styles.avatarButton,
                      avatarUploading ? styles.avatarButtonDisabled : null,
                    ]}
                    activeOpacity={0.86}
                    onPress={() => void confirmAvatarUpload()}
                    disabled={avatarUploading}
                  >
                    <Text style={styles.avatarButtonText}>
                      {avatarUploading ? t("photos.uploading") : t("photos.uploadAvatar")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.avatarSecondaryButton}
                    activeOpacity={0.86}
                    onPress={() => void pickAvatar()}
                    disabled={avatarUploading}
                  >
                    <Text style={styles.avatarSecondaryButtonText}>
                      {t("photos.chooseAnother")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.avatarSecondaryButton}
                    activeOpacity={0.86}
                    onPress={() => setPendingAvatar(null)}
                    disabled={avatarUploading}
                  >
                    <Text style={styles.avatarSecondaryButtonText}>{t("common.cancel")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.avatarButton, avatarUploading ? styles.avatarButtonDisabled : null]}
                  activeOpacity={0.86}
                  onPress={() => void pickAvatar()}
                  disabled={avatarUploading}
                >
                  <Text style={styles.avatarButtonText}>
                    {avatarUploading
                      ? t("photos.uploading")
                      : avatarUrl
                        ? t("photos.replacePhoto")
                        : t("photos.choosePhoto")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {amoriaId ? (
            <Text style={styles.amoriaIdText}>
              {t("profile.amoriaId")}: {amoriaId}
            </Text>
          ) : null}
          <View style={styles.badges}>
            <TouchableOpacity
              style={[styles.badge, styles.editableBadge]}
              activeOpacity={0.86}
              onPress={() => openEditProfile("goal")}
              accessibilityRole="button"
            >
              <Text style={styles.badgeText}>{goalLabel}</Text>
              <Text style={styles.badgeActionText}>
                {t("profile.editProfileEntrypointAction")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.badge, styles.editableBadge]}
              activeOpacity={0.86}
              onPress={() => openEditProfile("mood")}
              accessibilityRole="button"
            >
              <Text style={styles.badgeText}>{moodLabel}</Text>
              <Text style={styles.badgeActionText}>
                {t("profile.editProfileEntrypointAction")}
              </Text>
            </TouchableOpacity>
            {profile?.allowAdultMode ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("common.adultShort")}</Text>
              </View>
            ) : null}
            {profile?.mysteryMode ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("profile.mysteryBadge")}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.editEntrypoints}>
            <TouchableOpacity
              style={styles.editEntryRow}
              activeOpacity={0.86}
              onPress={() => openEditProfile("about")}
            >
              <View style={styles.editEntryCopy}>
                <Text style={styles.editEntryTitle}>
                  {t("profile.aboutEntrypointTitle")}
                </Text>
                <Text style={styles.editEntryValue} numberOfLines={2}>
                  {about}
                </Text>
              </View>
              <Text style={styles.editEntryAction}>
                {t("profile.editProfileEntrypointAction")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editEntryRow}
              activeOpacity={0.86}
              onPress={() => openEditProfile("mood")}
            >
              <View style={styles.editEntryCopy}>
                <Text style={styles.editEntryTitle}>
                  {t("profile.moodEntrypointTitle")}
                </Text>
                <Text style={styles.editEntryValue} numberOfLines={1}>
                  {moodLabel}
                </Text>
              </View>
              <Text style={styles.editEntryAction}>
                {t("profile.editProfileEntrypointAction")}
              </Text>
            </TouchableOpacity>
          </View>
          {profile?.interests?.length ? (
            <View style={styles.interests}>
              {profile.interests.map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.identityCard, needsName ? styles.identityCardAlert : null]}>
          <Text style={styles.identityKicker}>
            {needsName ? t("profile.completeProfile") : t("profile.editName")}
          </Text>
          <Text style={styles.identityTitle}>{t("profile.yourName")}</Text>
          {needsName ? (
            <Text style={styles.identityBody}>{t("profile.completeProfileBody")}</Text>
          ) : null}
          <TextInput
            ref={nameInputRef}
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder={t("profile.enterName")}
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="words"
            editable={!nameSaving}
            style={styles.nameInput}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => void saveDisplayName()}
          />
          {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}
          <TouchableOpacity
            style={[styles.saveNameButton, nameSaving ? styles.avatarButtonDisabled : null]}
            activeOpacity={0.86}
            onPress={() => void saveDisplayName()}
            disabled={nameSaving}
          >
            <Text style={styles.saveNameButtonText}>
              {nameSaving ? t("common.saving") : t("profile.saveName")}
            </Text>
          </TouchableOpacity>
          {amoriaId ? (
            <Text style={styles.identityMeta}>
              {t("profile.yourAmoriaId")}: {amoriaId}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.86}
            onPress={() => openEditProfile()}
          >
            <Text style={styles.actionButtonText}>{t("profile.edit")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.86}
            onPress={() => navigation.navigate("PhotoManager")}
          >
            <Text style={styles.actionButtonText}>{t("profile.photos")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.86}
            onPress={() => navigation.navigate("FlirtSettings")}
          >
            <Text style={styles.actionButtonText}>{t("profile.flirt18")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.galleryCard}>
          {photos.length ? (
            <View style={styles.galleryGrid}>
              {photos.map((photo, index) => (
                <Image
                  key={`${photo.mediaId ?? photo.url}-${index}`}
                  source={{ uri: photo.url }}
                  style={styles.galleryPhoto}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyPhotos}>{t("photos.empty")}</Text>
          )}
        </View>

        <ImageCropper
          visible={Boolean(croppingAvatar)}
          source={croppingAvatar}
          title={t("photos.cropAvatarTitle")}
          helpText={t("photos.cropHelp")}
          doneLabel={t("common.done")}
          cancelLabel={t("photos.cropCancel")}
          chooseAnotherLabel={t("photos.cropChooseAnother")}
          resetLabel={t("photos.cropReset")}
          onDone={confirmAvatarCrop}
          onCancel={cancelAvatarCrop}
          onChooseAnother={() => void chooseAnotherAvatarForCrop()}
          onError={(step, error, metadata) => {
            reportAvatarCropError(step, error, metadata);
            Alert.alert(t("photos.cropFailedTitle"), t("photos.cropFailedBody"));
          }}
        />
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 28,
    gap: 16,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loaderText: {
    color: theme.colors.subtext,
  },
  heroCard: {
    backgroundColor: "rgba(8, 12, 24, 0.74)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 14,
  },
  avatarPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  avatarCopy: {
    flex: 1,
    gap: 7,
  },
  avatarPreviewFrame: {
    width: 108,
    height: 108,
    borderRadius: 54,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  avatarCropFrame: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  avatarPreviewImage: {
    width: "100%",
    height: "100%",
  },
  avatarUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  avatarTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  avatarBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  avatarButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: theme.colors.primary,
  },
  avatarButtonDisabled: {
    opacity: 0.65,
  },
  avatarButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  avatarConfirmActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  avatarSecondaryButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  avatarSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  displayName: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  amoriaIdText: {
    color: theme.colors.subtext,
    fontSize: 13,
    fontWeight: "700",
  },
  identityCard: {
    backgroundColor: "rgba(8, 12, 24, 0.82)",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 9,
  },
  identityCardAlert: {
    borderColor: "rgba(255, 122, 60, 0.36)",
    backgroundColor: "rgba(30, 18, 24, 0.92)",
  },
  identityKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  identityTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  identityBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  nameInput: {
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nameError: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  saveNameButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  saveNameButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  identityMeta: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  editableBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderColor: "rgba(255,255,255,0.18)",
  },
  badgeActionText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  editEntrypoints: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  editEntryRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  editEntryCopy: {
    flex: 1,
    gap: 4,
  },
  editEntryTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  editEntryValue: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  editEntryAction: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  interests: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255, 78, 138, 0.16)",
  },
  interestText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    gap: 10,
  },
  actionButton: {
    backgroundColor: "rgba(8, 12, 24, 0.82)",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  galleryCard: {
    backgroundColor: "rgba(8, 12, 24, 0.74)",
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  galleryPhoto: {
    width: "48.2%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  emptyPhotos: {
    color: theme.colors.subtext,
    textAlign: "center",
    paddingVertical: 28,
  },
});
