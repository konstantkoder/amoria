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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ImageCropper, {
  CroppedMediaPreview,
  type NormalizedMediaCrop,
} from "@/components/media/ImageCropper";
import {
  GOAL_LABEL_FALLBACKS,
  GOAL_LABEL_KEYS,
  MOOD_LABEL_FALLBACKS,
  MOOD_LABEL_KEYS,
} from "@/config/profileFields";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import { useLocale } from "@/contexts/LocaleContext";
import type { ProfileGender, UserProfile, UserProfilePhoto } from "@/models/User";
import type { ProfileStackParamList, RootStackNavigationProp } from "@/navigation/appRoutes";
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
  refreshUserProfile,
  updateUserAvatarUrl,
  updateUserDisplayName,
} from "@/services/user";
import {
  getPublicMediaUrlInfo,
  probePublicMediaUrlInfo,
  type PublicMediaUrlInfo,
} from "@/services/media/mediaUrl";
import { theme } from "@/theme";

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, "ProfileMain">;
type EditProfileFocus = NonNullable<ProfileStackParamList["EditProfile"]>["focus"];
type PendingAvatar = {
  uri: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  crop: NormalizedMediaCrop;
};
type AvatarForCrop = Omit<PendingAvatar, "crop">;

let profileAvatarCacheVersion = 0;

function nextProfileAvatarCacheVersion() {
  profileAvatarCacheVersion += 1;
  return profileAvatarCacheVersion;
}

function getProfileAvatarCacheKey(profile: UserProfile | null, cacheVersion: number) {
  return `${profile?.updatedAt ?? 0}:${cacheVersion}`;
}

function samePublicAvatarReference(left: unknown, right: unknown) {
  const leftInfo = getPublicMediaUrlInfo(left, "avatar URL");
  const rightInfo = getPublicMediaUrlInfo(right, "avatar URL");
  if (leftInfo.mediaId && rightInfo.mediaId) {
    return leftInfo.mediaId === rightInfo.mediaId;
  }

  return Boolean(leftInfo.url && rightInfo.url && leftInfo.url === rightInfo.url);
}

function withVisibleAvatarUrl(
  profile: UserProfile | null,
  avatarUrl: string
): UserProfile | null {
  const stableAvatarUrl = String(avatarUrl ?? "").trim();
  if (!profile || !stableAvatarUrl) return profile;
  return {
    ...profile,
    avatarUrl: stableAvatarUrl,
  };
}

function reconcileRefreshedAvatarProfile(
  refreshedProfile: UserProfile,
  uploadedAvatarUrl: string
) {
  if (samePublicAvatarReference(refreshedProfile.avatarUrl, uploadedAvatarUrl)) {
    return refreshedProfile;
  }

  return withVisibleAvatarUrl(refreshedProfile, uploadedAvatarUrl) ?? refreshedProfile;
}

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

function formatOwnAgeLabel(
  profile: UserProfile | null,
  t: (key: string, params?: Record<string, string>) => string
) {
  let ageGroup = profile?.ageGroup ?? "";
  if (!ageGroup && typeof profile?.age === "number") {
    if (profile.age >= 55) ageGroup = "55+";
    else if (profile.age >= 45) ageGroup = "45-54";
    else if (profile.age >= 35) ageGroup = "35-44";
    else if (profile.age >= 25) ageGroup = "25-34";
    else if (profile.age >= 18) ageGroup = "18-24";
  }
  if (ageGroup) {
    const value = t("profile.ageGroupValue", { group: ageGroup });
    return value === "profile.ageGroupValue" ? ageGroup : value;
  }
  return "";
}

function formatSearchAgePreference(
  profile: UserProfile | null,
  t: (key: string, params?: Record<string, string>) => string
) {
  const min = profile?.preferredAgeMin;
  const max = profile?.preferredAgeMax;
  if (typeof min === "number" && typeof max === "number") {
    const value = t("profile.searchAgePreferenceRange", {
      min: String(min),
      max: String(max),
    });
    return value === "profile.searchAgePreferenceRange" ? `${min}-${max}` : value;
  }
  if (typeof min === "number" && max === null) {
    const value = t("profile.searchAgePreferenceOpen", { min: String(min) });
    return value === "profile.searchAgePreferenceOpen" ? `${min}+` : value;
  }
  return t("profile.searchAgePreferenceDefault");
}

function formatOwnGender(
  profile: UserProfile | null,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (!profile?.gender) return t("profile.genderMissing");
  return t(`profile.gender.${profile.gender}`);
}

function formatLookingForGender(
  gender: ProfileGender,
  t: (key: string, params?: Record<string, string>) => string
) {
  return t(`profile.lookingFor.${gender}`);
}

function formatLookingForPreference(
  profile: UserProfile | null,
  t: (key: string, params?: Record<string, string>) => string
) {
  const preferredGenders = profile?.preferredGenders;
  if (!Array.isArray(preferredGenders)) return t("profile.lookingForMissing");
  if (preferredGenders.length === 0) return t("profile.lookingFor.everyone");
  return preferredGenders.map((gender) => formatLookingForGender(gender, t)).join(", ");
}

function ProfileSummaryRow({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, warning ? styles.summaryRowWarning : null]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ProfilePublicPhoto({
  photo,
  index,
  onLoadFailed,
  failedLabel,
}: {
  photo: UserProfilePhoto;
  index: number;
  onLoadFailed: (input: {
    mediaId?: string;
    urlInfo: PublicMediaUrlInfo;
    visibility?: "public";
  }) => void;
  failedLabel: string;
}) {
  const urlInfo = React.useMemo(
    () => getPublicMediaUrlInfo(photo.url, "profile public photo URL"),
    [photo.url]
  );
  const [state, setState] = React.useState<"idle" | "loading" | "loaded" | "error">(
    urlInfo.url ? "idle" : "error"
  );

  React.useEffect(() => {
    setState(urlInfo.url ? "idle" : "error");
  }, [urlInfo.url]);

  React.useEffect(() => {
    if (!urlInfo.url) {
      onLoadFailed({
        mediaId: photo.mediaId,
        urlInfo,
        visibility: "public",
      });
    }
  }, [onLoadFailed, photo.mediaId, urlInfo]);

  const imageLoading = state === "idle" || state === "loading";
  const imageFailed = state === "error";

  return (
    <View style={styles.galleryPhotoFrame}>
      {urlInfo.url && !imageFailed ? (
        <Image
          source={{ uri: urlInfo.url }}
          style={styles.galleryPhoto}
          resizeMode="cover"
          onLoadStart={() => setState("loading")}
          onLoad={() => setState("loaded")}
          onError={() => {
            setState("error");
            onLoadFailed({
              mediaId: photo.mediaId,
              urlInfo,
              visibility: "public",
            });
          }}
          accessibilityLabel={`profile-photo-${index + 1}`}
        />
      ) : null}
      {imageLoading && urlInfo.url ? (
        <View style={styles.galleryPhotoOverlay}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
      {imageFailed ? (
        <View style={styles.galleryPhotoError}>
          <Text style={styles.galleryPhotoErrorText}>{failedLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const rootNavigation = navigation.getParent<RootStackNavigationProp>();
  const { t } = useLocale();
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [pendingAvatar, setPendingAvatar] = React.useState<PendingAvatar | null>(null);
  const [croppingAvatar, setCroppingAvatar] = React.useState<AvatarForCrop | null>(null);
  const [nameDraft, setNameDraft] = React.useState("");
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState("");
  const [avatarCacheKey, setAvatarCacheKey] = React.useState(profileAvatarCacheVersion);
  const nameInputRef = React.useRef<TextInput>(null);
  const reportedMediaFailuresRef = React.useRef<Set<string>>(new Set());

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
  const avatarDisplayCacheKey = React.useMemo(
    () => getProfileAvatarCacheKey(profile, avatarCacheKey),
    [avatarCacheKey, profile]
  );
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
  const ageLabel = formatOwnAgeLabel(profile, t);
  const searchAgePreference = formatSearchAgePreference(profile, t);
  const ownGenderLabel = formatOwnGender(profile, t);
  const lookingForLabel = formatLookingForPreference(profile, t);
  const missingOwnGender = Boolean(profile && !profile.gender);
  const missingLookingFor = Boolean(profile && profile.preferredGenders === undefined);
  const interestsSummary = profile?.interests?.length
    ? profile.interests.join(", ")
    : t("profile.interestsEmpty");

  const reportProfileMediaLoadFailed = React.useCallback(
    (
      action: "loadAvatar" | "loadPublicPhoto",
      input: {
        mediaId?: string;
        urlInfo: PublicMediaUrlInfo;
        visibility?: "avatar" | "public";
      }
    ) => {
      const mediaId = input.mediaId ?? input.urlInfo.mediaId;
      const reportKey = `${action}:${mediaId ?? input.urlInfo.urlKind}`;
      if (reportedMediaFailuresRef.current.has(reportKey)) return;
      reportedMediaFailuresRef.current.add(reportKey);

      void probePublicMediaUrlInfo(input.urlInfo).then((probe) => {
        reportClientError({
          screen: "ProfileScreen",
          action,
          step: "imageLoadFailed",
          message: "Profile media failed to load",
          metadata: {
            ...(mediaId ?? probe.mediaId ? { mediaId: mediaId ?? probe.mediaId } : {}),
            urlKind: probe.urlKind,
            httpStatus: probe.httpStatus ?? null,
            contentType: probe.contentType ?? null,
            hasAvatarUrl: Boolean(avatarUrl),
            photoCount: photos.length,
            visibility: input.visibility ?? (action === "loadAvatar" ? "avatar" : "public"),
          },
        });
      });
    },
    [avatarUrl, photos.length]
  );

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

      const nextCacheVersion = nextProfileAvatarCacheVersion();
      setAvatarCacheKey(nextCacheVersion);
      setProfile((current) => withVisibleAvatarUrl(current ?? currentProfile, avatarDownloadUrl));
      setPendingAvatar(null);

      const nextProfile = await updateUserAvatarUrl(avatarDownloadUrl);
      const confirmedAvatarUrl = nextProfile.avatarUrl || avatarDownloadUrl;
      setProfile(withVisibleAvatarUrl(nextProfile, confirmedAvatarUrl));
      const refreshedProfile = await refreshUserProfile().catch(() => nextProfile);
      setProfile(reconcileRefreshedAvatarProfile(refreshedProfile, confirmedAvatarUrl));
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
    (focus?: EditProfileFocus) => {
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

  const openNearbyActivityPreferences = React.useCallback(() => {
    if (rootNavigation) {
      rootNavigation.navigate("NearbyActivityPreferences");
      return;
    }

    reportClientError({
      screen: "ProfileScreen",
      action: "openNearbyActivityPreferences",
      step: "missingRootNavigation",
      message: "Missing root navigation while opening NearbyActivityPreferences",
    });
    Alert.alert(
      t("profile.nearbyActivityQuestionnaireOpenFailedTitle"),
      t("profile.nearbyActivityQuestionnaireOpenFailedBody")
    );
  }, [rootNavigation, t]);

  if (loading) {
    return (
      <ScreenShell
        title={t("screen.profile")}
        background="profileWarm"
        overlayOpacity={0.16}
        blurRadius={0}
      >
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.textAccent} />
          <Text style={styles.loaderText}>{t("editProfile.loading")}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("screen.profile")}
      background="profileWarm"
      overlayOpacity={0.16}
      blurRadius={0}
    >
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
                <UserAvatar
                  avatarUrl={avatarUrl}
                  label={displayName}
                  size={108}
                  cacheKey={avatarDisplayCacheKey}
                  onLoadError={(urlInfo) => {
                    reportProfileMediaLoadFailed("loadAvatar", {
                      urlInfo,
                      visibility: "avatar",
                    });
                  }}
                />
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
        </View>

        {needsName ? (
          <View style={[styles.identityCard, styles.identityCardAlert]}>
            <Text style={styles.identityKicker}>{t("profile.completeProfile")}</Text>
            <Text style={styles.identityTitle}>{t("profile.yourName")}</Text>
            <Text style={styles.identityBody}>{t("profile.completeProfileBody")}</Text>
            <TextInput
              ref={nameInputRef}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t("profile.enterName")}
              placeholderTextColor="rgba(226,232,255,0.46)"
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
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>{t("profile.anketaTitle")}</Text>
              <Text style={styles.sectionSubtitle}>{t("profile.anketaSubtitle")}</Text>
            </View>
            <TouchableOpacity
              style={styles.sectionAction}
              activeOpacity={0.86}
              onPress={() => openEditProfile()}
            >
              <Text style={styles.sectionActionText}>
                {t("profile.editProfileEntrypointAction")}
              </Text>
            </TouchableOpacity>
          </View>
          <ProfileSummaryRow label={t("profile.aboutEntrypointTitle")} value={about} />
          <ProfileSummaryRow label={t("profile.goalEntrypointTitle")} value={goalLabel} />
          <ProfileSummaryRow label={t("profile.moodEntrypointTitle")} value={moodLabel} />
          <ProfileSummaryRow
            label={t("profile.ageEntrypointTitle")}
            value={ageLabel || t("profile.birthDateMissingBody")}
            warning={!ageLabel}
          />
          <ProfileSummaryRow label={t("profile.interestsTitle")} value={interestsSummary} />
          {profile?.mysteryMode ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{t("profile.mysteryBadge")}</Text>
            </View>
          ) : null}
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

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>{t("profile.searchSectionTitle")}</Text>
              <Text style={styles.sectionSubtitle}>{t("profile.searchSectionSubtitle")}</Text>
            </View>
            <TouchableOpacity
              style={styles.sectionAction}
              activeOpacity={0.86}
              onPress={() => openEditProfile("preferences")}
            >
              <Text style={styles.sectionActionText}>
                {t("profile.editProfileEntrypointAction")}
              </Text>
            </TouchableOpacity>
          </View>
          <ProfileSummaryRow
            label={t("profile.genderSummaryTitle")}
            value={ownGenderLabel}
            warning={missingOwnGender}
          />
          <ProfileSummaryRow
            label={t("profile.lookingForSummaryTitle")}
            value={lookingForLabel}
            warning={missingLookingFor}
          />
          <ProfileSummaryRow
            label={t("profile.searchAgePreferenceTitle")}
            value={searchAgePreference}
          />
          <Text style={styles.sectionNote}>{t("profile.searchReuseNote")}</Text>
        </View>

        <View style={[styles.sectionCard, styles.nearbyActivityCard]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>
                {t("profile.nearbyActivityQuestionnaireTitle")}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {t("profile.nearbyActivityQuestionnaireSubtitle")}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.sectionAction, styles.nearbyActivityAction]}
              activeOpacity={0.86}
              onPress={openNearbyActivityPreferences}
            >
              <Ionicons name="options-outline" size={18} color={theme.colors.textAccent} />
              <Text style={[styles.sectionActionText, styles.nearbyActivityActionText]}>
                {t("profile.nearbyActivityQuestionnaireAction")}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionNote}>
            {t("profile.nearbyActivityQuestionnaireBody")}
          </Text>
        </View>

        <View style={[styles.sectionCard, styles.photoSectionCard]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text style={styles.sectionTitle}>{t("profile.photos")}</Text>
              <Text style={styles.sectionSubtitle}>{t("profile.photosSubtitle")}</Text>
            </View>
            <TouchableOpacity
              style={styles.sectionAction}
              activeOpacity={0.86}
              onPress={() => navigation.navigate("PhotoManager")}
            >
              <Text style={styles.sectionActionText}>{t("profile.managePhotos")}</Text>
            </TouchableOpacity>
          </View>
          {photos.length ? (
            <View style={styles.galleryGrid}>
              {photos.map((photo, index) => (
                <ProfilePublicPhoto
                  key={`${photo.mediaId ?? photo.url}-${index}`}
                  photo={photo}
                  index={index}
                  onLoadFailed={(input) =>
                    reportProfileMediaLoadFailed("loadPublicPhoto", input)
                  }
                  failedLabel={t("photos.previewFailed")}
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
    borderColor: theme.colors.textAccent,
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
    minHeight: theme.buttons.primary.height,
    borderRadius: theme.buttons.primary.borderRadius,
    paddingHorizontal: theme.buttons.primary.paddingHorizontal,
    paddingVertical: 9,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
  },
  avatarButtonDisabled: {
    opacity: 0.65,
  },
  avatarButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
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
  sectionCard: {
    backgroundColor: "rgba(8, 12, 24, 0.72)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    gap: 12,
  },
  photoSectionCard: {
    marginTop: 6,
    backgroundColor: "rgba(10, 16, 28, 0.78)",
    borderColor: theme.colors.borderWarm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  sectionAction: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sectionActionText: {
    color: theme.colors.textAccent,
    fontSize: 12,
    fontWeight: "900",
  },
  sectionNote: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
    lineHeight: 18,
  },
  nearbyActivityCard: {
    backgroundColor: theme.cards.standard.backgroundColor,
    borderColor: theme.cards.standard.borderColor,
    borderWidth: theme.cards.standard.borderWidth,
    borderRadius: theme.cards.standard.borderRadius,
    padding: theme.cards.standard.padding,
  },
  nearbyActivityAction: {
    minHeight: theme.buttons.secondary.minHeight,
    height: theme.buttons.secondary.height,
    paddingHorizontal: theme.buttons.secondary.paddingHorizontal,
    paddingVertical: 0,
    borderRadius: theme.buttons.secondary.borderRadius,
    borderWidth: theme.buttons.secondary.borderWidth,
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderColor: theme.buttons.secondary.borderColor,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.buttons.secondary.iconTextGap,
  },
  nearbyActivityActionText: {
    color: theme.buttons.secondary.textColor,
    fontSize: theme.buttons.secondary.fontSize,
    lineHeight: theme.buttons.secondary.lineHeight,
    fontWeight: theme.buttons.secondary.fontWeight,
  },
  summaryRow: {
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.09)",
  },
  summaryRowWarning: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.warningBg,
    borderTopColor: theme.colors.borderWarm,
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "800",
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
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
    borderColor: theme.colors.borderWarm,
    backgroundColor: theme.colors.warningBg,
  },
  identityKicker: {
    color: theme.colors.textAccent,
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
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 20,
  },
  nameError: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  saveNameButton: {
    alignSelf: "flex-start",
    minHeight: theme.buttons.primary.height,
    borderRadius: theme.buttons.primary.borderRadius,
    paddingHorizontal: theme.buttons.primary.paddingHorizontal,
    paddingVertical: 10,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
  },
  saveNameButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
  },
  identityMeta: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  metaPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  metaPillText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
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
    backgroundColor: theme.colors.surfaceWarm,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  interestText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  galleryPhotoFrame: {
    width: "48.2%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  galleryPhoto: {
    width: "100%",
    height: "100%",
  },
  galleryPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  galleryPhotoError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "rgba(8, 12, 24, 0.92)",
  },
  galleryPhotoErrorText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: "800",
  },
  emptyPhotos: {
    color: theme.colors.subtext,
    textAlign: "center",
    paddingVertical: 28,
  },
});
