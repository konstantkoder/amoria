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
import { useFocusEffect } from "@react-navigation/native";

import ImageCropper, {
  CroppedMediaPreview,
  type NormalizedMediaCrop,
} from "@/components/media/ImageCropper";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { ApiError } from "@/services/api/apiClient";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import {
  getMyProfileGallery,
  resetLockedGalleryPassword,
  setLockedGalleryPassword,
  updateMyProfileGalleryItems,
} from "@/services/api/profileApi";
import type {
  OwnerProfileGalleryResponse,
  ProfileGalleryPhotoDto,
  ProfileGalleryVisibility,
} from "@/services/api/types";
import {
  UploadFlowError,
  getUriScheme,
  uploadProfilePhoto,
  deleteProfilePhoto,
} from "@/services/storage";
import {
  getPublicMediaUrlInfo,
  normalizePublicMediaUrl,
  probePublicMediaUrlInfo,
} from "@/services/media/mediaUrl";
import { theme } from "@/theme";

type PasswordMode = "set" | "reset" | "";
type PendingPickedPhoto = {
  uri: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  crop: NormalizedMediaCrop;
};
type PickedPhotoForCrop = Omit<PendingPickedPhoto, "crop">;
type PhotoImageState = "idle" | "loading" | "loaded" | "error";
const FALLBACK_MAX_PROFILE_GALLERY_PHOTOS = 15;
const FALLBACK_MAX_LOCKED_PROFILE_PHOTOS = 10;

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

export default function PhotoManagerScreen() {
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string) => {
      const value = t(key);
      return value === key ? fallback : value;
    },
    [t]
  );
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [passwordBusy, setPasswordBusy] = React.useState(false);
  const [gallery, setGallery] = React.useState<OwnerProfileGalleryResponse | null>(null);
  const [pendingPhoto, setPendingPhoto] = React.useState<PendingPickedPhoto | null>(null);
  const [croppingPhoto, setCroppingPhoto] = React.useState<PickedPhotoForCrop | null>(null);
  const [passwordMode, setPasswordMode] = React.useState<PasswordMode>("");
  const [currentAccountPassword, setCurrentAccountPassword] = React.useState("");
  const [newFolderPassword, setNewFolderPassword] = React.useState("");
  const [photoImageStates, setPhotoImageStates] = React.useState<Record<string, PhotoImageState>>({});
  const currentPasswordInputRef = React.useRef<TextInput>(null);
  const newFolderPasswordInputRef = React.useRef<TextInput>(null);
  const reportedPhotoFailuresRef = React.useRef<Set<string>>(new Set());

  const refreshGallery = React.useCallback(async () => {
    const nextGallery = await getMyProfileGallery();
    setGallery(nextGallery);
    return nextGallery;
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);

      void refreshGallery()
        .catch(() => {
          if (active) {
            Alert.alert(t("common.error"), t("editProfile.loadErrorBody"));
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
    }, [refreshGallery, t])
  );

  const publicPhotos = gallery?.publicPhotos ?? [];
  const lockedPhotos = gallery?.lockedPhotos ?? [];
  const totalPhotos = publicPhotos.length + lockedPhotos.length;
  const maxProfileGalleryPhotos =
    gallery?.maxProfileGalleryPhotos ?? FALLBACK_MAX_PROFILE_GALLERY_PHOTOS;
  const maxLockedProfilePhotos =
    gallery?.maxLockedProfilePhotos ?? FALLBACK_MAX_LOCKED_PROFILE_PHOTOS;
  const minVisibleImagesRequired = gallery?.minVisibleImagesRequired ?? 3;
  const galleryLimitReached = totalPhotos >= maxProfileGalleryPhotos;
  const lockedLimitReached = lockedPhotos.length >= maxLockedProfilePhotos;
  const pendingPhotoUri = pendingPhoto?.uri ?? "";

  React.useEffect(() => {
    [...publicPhotos, ...lockedPhotos].forEach((photo) => {
      const urlInfo = getPublicMediaUrlInfo(photo.url, "owner gallery photo URL");
      if (!urlInfo.url) {
        reportOwnerPhotoLoadFailed(photo);
      }
    });
  }, [lockedPhotos, publicPhotos]);

  function minVisibleMessage() {
    return tt(
      "photos.lockedGalleryMinVisible",
      "Чтобы включить закрытую папку, оставьте минимум 3 открытых изображения."
    );
  }

  function handleApiError(error: unknown, fallbackTitle: string, fallbackBody: string) {
    if (error instanceof Error && error.message === "photos.unsupportedImageType") {
      Alert.alert(
        tt("photos.unsupportedImageTypeTitle", "Формат фото не поддерживается"),
        tt(
          "photos.unsupportedImageTypeBody",
          "Выберите JPEG, PNG или WebP. Фото не было загружено."
        )
      );
      return;
    }

    if (error instanceof ApiError) {
      if (error.code === "min_visible_required") {
        Alert.alert(
          tt("photos.lockedGalleryCannotMoveTitle", "Нельзя скрыть фото"),
          minVisibleMessage()
        );
        return;
      }
      if (error.code === "profile_gallery_limit_reached") {
        Alert.alert(
          tt("photos.galleryLimitReachedTitle", "Лимит фото достигнут"),
          tt(
            "photos.galleryLimitReached",
            "Достигнут лимит фото. Удалите старые фото, чтобы добавить новые."
          )
        );
        return;
      }
      if (error.code === "locked_gallery_limit_reached") {
        Alert.alert(
          tt("photos.lockedGalleryLimitReachedTitle", "Лимит закрытой папки"),
          tt("photos.lockedGalleryLimitReached", "В закрытой папке уже максимум фото.")
        );
        return;
      }
      if (error.code === "locked_gallery_password_required") {
        Alert.alert(
          tt("photos.lockedGalleryPasswordRequiredTitle", "Нужен пароль"),
          tt("photos.lockedGalleryPasswordRequired", "Сначала задайте пароль закрытой папки")
        );
        setPasswordMode("set");
        return;
      }
      if (error.code === "invalid_credentials") {
        Alert.alert(
          tt("photos.accountPasswordInvalidTitle", "Пароль не подошёл"),
          tt("photos.accountPasswordInvalid", "Проверьте пароль от аккаунта и попробуйте ещё раз.")
        );
        return;
      }
    }

    const diagnosticBody = error instanceof ApiError && error.code
      ? `${fallbackBody}\n${error.code}`
      : fallbackBody;
    Alert.alert(fallbackTitle, diagnosticBody);
  }

  function handleDeleteError() {
    Alert.alert(t("photos.removeErrorTitle"), t("photos.removeErrorBody"));
  }

  async function addPhoto() {
    await pickPhotoForCrop();
  }

  async function pickPhotoForCrop() {
    if (galleryLimitReached) {
      Alert.alert(
        tt("photos.galleryLimitReachedTitle", "Лимит фото достигнут"),
        tt(
          "photos.galleryLimitReached",
          "Достигнут лимит фото. Удалите старые фото, чтобы добавить новые."
        )
      );
      return;
    }

    let status = "";
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = permission.status;
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "PhotoManagerScreen",
        action: "pickPhoto",
        step: "pickerFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          permissionStatus: status || "unknown",
        },
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
        screen: "PhotoManagerScreen",
        action: "pickPhoto",
        step: "pickerFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          permissionStatus: status || "unknown",
        },
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

    setCroppingPhoto({
      uri,
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      ...(typeof asset.fileSize === "number" ? { fileSize: asset.fileSize } : {}),
      ...(typeof asset.width === "number" ? { width: asset.width } : {}),
      ...(typeof asset.height === "number" ? { height: asset.height } : {}),
    });
  }

  function confirmPhotoCrop(crop: NormalizedMediaCrop) {
    if (!croppingPhoto) return;
    if (!isValidCrop(crop)) {
      reportCropError("cropInvalid", "profile_photo", undefined, { cropRatio: 0 });
      Alert.alert(t("photos.cropFailedTitle"), t("photos.cropFailedBody"));
      return;
    }

    setPendingPhoto({
      ...croppingPhoto,
      crop,
    });
    setCroppingPhoto(null);
  }

  function cancelPhotoCrop() {
    setCroppingPhoto(null);
  }

  async function chooseAnotherPhotoForCrop() {
    setCroppingPhoto(null);
    await pickPhotoForCrop();
  }

  function reportCropError(
    step: "cropOpenFailed" | "cropConfirmFailed" | "cropInvalid",
    source: "profile_photo",
    error?: unknown,
    metadata: Record<string, unknown> = {}
  ) {
    const safeError = error ? sanitizeErrorForReport(error) : null;
    void reportClientError({
      screen: "PhotoManagerScreen",
      action: "cropPhoto",
      step,
      code: safeError?.code,
      message: safeError?.message ?? step,
      stack: safeError?.stack,
      metadata: {
        source,
        mimeType: croppingPhoto?.mimeType ?? pendingPhoto?.mimeType ?? null,
        ...metadata,
      },
    });
  }

  async function confirmPendingPhotoUpload() {
    if (!pendingPhoto || busy) return;

    let uploadCompleted = false;
    try {
      setBusy(true);
      await uploadProfilePhoto(pendingPhoto.uri, {
        ...(pendingPhoto.mimeType ? { mimeType: pendingPhoto.mimeType } : {}),
        crop: pendingPhoto.crop,
      });
      uploadCompleted = true;
      await refreshGallery();
      setPendingPhoto(null);
      Alert.alert(t("common.done"), t("photos.saved"));
    } catch (error) {
      reportPhotoUploadError(error, {
        uri: pendingPhoto.uri,
        mimeType: pendingPhoto.mimeType,
        fileSize: pendingPhoto.fileSize,
        hasPendingPhotoUri: true,
        stepOverride: uploadCompleted ? "refreshGallery" : "profilePhotoUploadFailed",
      });
      handleApiError(error, t("photos.uploadFailed"), t("photos.uploadErrorBody"));
    } finally {
      setBusy(false);
    }
  }

  function reportPhotoUploadError(
    error: unknown,
    input: {
      uri: string;
      mimeType?: string;
      fileSize?: number;
      hasPendingPhotoUri: boolean;
      stepOverride?: string;
    }
  ) {
    const safeError = sanitizeErrorForReport(error);
    const uploadError = error instanceof UploadFlowError ? error : null;

    void reportClientError({
      screen: "PhotoManagerScreen",
      action: "confirmUpload",
      step: input.stepOverride ?? uploadError?.step,
      code: uploadError?.code ?? safeError.code,
      message: safeError.message,
      stack: safeError.stack,
      metadata: {
        hasPendingPhotoUri: input.hasPendingPhotoUri,
        ...(uploadError?.step ? { uploadStep: uploadError.step } : {}),
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(typeof input.fileSize === "number" ? { fileSize: input.fileSize } : {}),
        ...(getUriScheme(input.uri) ? { uriScheme: getUriScheme(input.uri) } : {}),
        ...(uploadError?.status ? { status: uploadError.status } : {}),
        ...(uploadError?.safeMetadata ?? {}),
      },
    });
  }

  async function removePhoto(photo: ProfileGalleryPhotoDto) {
    try {
      setBusy(true);
      await deleteProfilePhoto(photo.mediaId);
      await refreshGallery();
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      void reportClientError({
        screen: "PhotoManagerScreen",
        action: "deletePhoto",
        step: "deleteFailed",
        code: error instanceof ApiError ? error.code : safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          mediaId: photo.mediaId,
          ...(photo.galleryItemId ? { galleryItemId: photo.galleryItemId } : {}),
          httpStatus: error instanceof ApiError ? error.status : null,
          errorCode: error instanceof ApiError ? error.code ?? null : safeError.code ?? null,
          visibility: photo.visibility ?? null,
          moderationStatus: photo.moderationStatus ?? null,
        },
      });
      if (error instanceof ApiError && error.status === 404) {
        await refreshGallery().catch(() => undefined);
        Alert.alert(
          tt("photos.alreadyRemovedTitle", "Фото уже удалено"),
          tt("photos.alreadyRemovedBody", "Мы обновили галерею с сервера.")
        );
        return;
      }
      handleDeleteError();
    } finally {
      setBusy(false);
    }
  }

  function reportOwnerPhotoLoadFailed(photo: ProfileGalleryPhotoDto) {
    const urlInfo = getPublicMediaUrlInfo(photo.url, "owner gallery photo URL");
    const reportKey = `${photo.mediaId}:${urlInfo.urlKind}`;
    if (reportedPhotoFailuresRef.current.has(reportKey)) return;
    reportedPhotoFailuresRef.current.add(reportKey);

    void probePublicMediaUrlInfo(urlInfo).then((probe) => {
      reportClientError({
        screen: "PhotoManagerScreen",
        action: "loadOwnerPhoto",
        step: "imageLoadFailed",
        message: "Owner gallery photo failed to load",
        metadata: {
          mediaId: photo.mediaId,
          urlKind: probe.urlKind ?? urlInfo.urlKind,
          httpStatus: probe.httpStatus ?? null,
          contentType: probe.contentType ?? null,
          visibility: photo.visibility ?? null,
        },
      });
    });
  }

  async function movePhoto(photo: ProfileGalleryPhotoDto, visibility: ProfileGalleryVisibility) {
    if (visibility === "locked" && !gallery?.lockedFolderEnabled) {
      Alert.alert(
        tt("photos.lockedGalleryPasswordRequiredTitle", "Нужен пароль"),
        tt("photos.lockedGalleryPasswordRequired", "Сначала задайте пароль закрытой папки")
      );
      setPasswordMode("set");
      return;
    }
    if (visibility === "locked" && lockedLimitReached) {
      Alert.alert(
        tt("photos.lockedGalleryLimitReachedTitle", "Лимит закрытой папки"),
        tt("photos.lockedGalleryLimitReached", "В закрытой папке уже максимум фото.")
      );
      return;
    }

    try {
      setBusy(true);
      const nextGallery = await updateMyProfileGalleryItems({
        items: [{ mediaId: photo.mediaId, visibility }],
      });
      setGallery(nextGallery);
    } catch (error) {
      handleApiError(
        error,
        tt("photos.saveFailed", "Не удалось сохранить"),
        tt("photos.uploadErrorBody", "Попробуйте ещё раз позже.")
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordAction() {
    if (!currentAccountPassword.trim() || passwordBusy) return;
    if (passwordMode === "set" && newFolderPassword.length < 8) {
      Alert.alert(
        tt("photos.lockedGalleryPasswordTooShortTitle", "Пароль слишком короткий"),
        tt("photos.lockedGalleryPasswordTooShort", "Пароль закрытой папки должен быть не короче 8 символов.")
      );
      return;
    }

    try {
      setPasswordBusy(true);
      if (passwordMode === "set") {
        await setLockedGalleryPassword({
          currentAccountPassword,
          newFolderPassword,
        });
      } else if (passwordMode === "reset") {
        await resetLockedGalleryPassword({
          currentAccountPassword,
        });
      }

      setCurrentAccountPassword("");
      setNewFolderPassword("");
      setPasswordMode("");
      currentPasswordInputRef.current?.blur();
      newFolderPasswordInputRef.current?.blur();
      Keyboard.dismiss();
      await refreshGallery();
      Alert.alert(t("common.done"), tt("photos.lockedGalleryPasswordSaved", "Настройки закрытой папки сохранены."));
    } catch (error) {
      handleApiError(
        error,
        tt("photos.saveFailed", "Не удалось сохранить"),
        tt("photos.lockedGalleryPasswordSaveFailed", "Проверьте пароль от аккаунта и попробуйте ещё раз.")
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  function renderPhoto(
    photo: ProfileGalleryPhotoDto,
    visibility: ProfileGalleryVisibility
  ) {
    const moveTarget = visibility === "public" ? "locked" : "public";
    const moveDisabled = busy || (moveTarget === "locked" && lockedLimitReached);
    const resolvedPhotoUrl = normalizePublicMediaUrl(photo.url, "owner gallery photo URL") ?? "";
    const imageState = photoImageStates[photo.mediaId] ?? (resolvedPhotoUrl ? "idle" : "error");
    const imageLoading = imageState === "loading" || imageState === "idle";
    const imageFailed = imageState === "error";
    const setImageState = (state: PhotoImageState) => {
      setPhotoImageStates((current) => ({
        ...current,
        [photo.mediaId]: state,
      }));
    };

    return (
      <View key={photo.mediaId} style={styles.photoCard}>
        <View style={styles.photoImageWrap}>
          {resolvedPhotoUrl ? (
            <Image
              source={{ uri: resolvedPhotoUrl }}
              style={styles.photoImage}
              onLoadStart={() => setImageState("loading")}
              onLoad={() => setImageState("loaded")}
              onError={() => {
                setImageState("error");
                reportOwnerPhotoLoadFailed(photo);
              }}
            />
          ) : null}
          {imageLoading && resolvedPhotoUrl ? (
            <View style={styles.photoImageOverlay}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
          {imageFailed ? (
            <View style={styles.photoImageError}>
              <Text style={styles.photoImageErrorTitle}>
                {tt("photos.previewFailed", "Фото не открылось")}
              </Text>
              <Text style={styles.photoImageErrorText}>
                {tt("photos.brokenPhotoCanRemove", "Можно удалить это фото и загрузить новое.")}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.photoActions}>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => void movePhoto(photo, moveTarget)}
            disabled={moveDisabled}
            style={[
              styles.photoActionButton,
              moveDisabled ? styles.photoActionButtonDisabled : null,
            ]}
          >
            <Text style={styles.photoActionText}>
              {moveTarget === "locked"
                ? tt("photos.moveToLocked", "В закрытую")
                : tt("photos.moveToPublic", "В открытые")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => void removePhoto(photo)}
            disabled={busy}
            style={styles.photoActionButton}
          >
            <Text style={styles.photoActionText}>{t("photos.remove")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <ScreenShell
        title={t("profile.photos")}
        background="profileWarm"
        overlayOpacity={0.16}
        showBack
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
      title={t("profile.photos")}
      background="profileWarm"
      overlayOpacity={0.16}
      showBack
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {tt("photos.lockedGalleryTitle", "Закрытая папка")}
          </Text>
          <Text style={styles.summaryText}>
            {tt("photos.photoLimitCount", "Фото: {count} из {max}")
              .replace("{count}", String(totalPhotos))
              .replace("{max}", String(maxProfileGalleryPhotos))}
          </Text>
          <Text style={styles.summaryText}>
            {tt("photos.lockedPhotoLimitCount", "Закрытая папка: {count} из {max}")
              .replace("{count}", String(lockedPhotos.length))
              .replace("{max}", String(maxLockedProfilePhotos))}
          </Text>
          <Text style={styles.summaryText}>
            {tt(
              "photos.visibleCountWithMinimum",
              "Открытых изображений: {count} из {min} минимум"
            )
              .replace("{count}", String(gallery?.visibleImagesCount ?? 0))
              .replace("{min}", String(minVisibleImagesRequired))}
          </Text>
          <Text style={styles.summaryText}>{minVisibleMessage()}</Text>
          <View style={styles.summaryActions}>
            <TouchableOpacity
              onPress={() => setPasswordMode("set")}
              disabled={passwordBusy}
              style={styles.smallButton}
              activeOpacity={0.86}
            >
              <Text style={styles.smallButtonText}>
                {gallery?.lockedFolderEnabled
                  ? tt("photos.changeLockedPassword", "Сменить пароль")
                  : tt("photos.setLockedPassword", "Задать пароль")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPasswordMode("reset")}
              disabled={passwordBusy}
              style={styles.smallButton}
              activeOpacity={0.86}
            >
              <Text style={styles.smallButtonText}>
                {tt("photos.resetLockedPassword", "Сбросить пароль")}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helpText}>
            {tt(
              "photos.lockedGalleryForgotHelp",
              "Если вы забыли пароль закрытой папки, сбросьте его, подтвердив пароль от аккаунта."
            )}
          </Text>
        </View>

        {passwordMode ? (
          <View style={styles.passwordCard}>
            <Text style={styles.summaryTitle}>
              {passwordMode === "set"
                ? tt("photos.setLockedPassword", "Задать пароль")
                : tt("photos.resetLockedPassword", "Сбросить пароль")}
            </Text>
            <TextInput
              ref={currentPasswordInputRef}
              value={currentAccountPassword}
              onChangeText={setCurrentAccountPassword}
              secureTextEntry
              placeholder={tt("photos.accountPasswordPlaceholder", "Пароль от аккаунта")}
              placeholderTextColor="rgba(226,232,255,0.46)"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType={passwordMode === "set" ? "next" : "done"}
              onSubmitEditing={() => {
                if (passwordMode === "set") {
                  newFolderPasswordInputRef.current?.focus();
                } else {
                  void submitPasswordAction();
                }
              }}
            />
            {passwordMode === "set" ? (
              <TextInput
                ref={newFolderPasswordInputRef}
                value={newFolderPassword}
                onChangeText={setNewFolderPassword}
                secureTextEntry
                placeholder={tt("photos.lockedFolderPasswordPlaceholder", "Новый пароль папки")}
                placeholderTextColor="rgba(226,232,255,0.46)"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => void submitPasswordAction()}
              />
            ) : (
              <Text style={styles.helpText}>
                {tt(
                  "photos.lockedGalleryResetKeepsPhotos",
                  "Закрытые фото останутся закрытыми и не откроются, пока вы не зададите новый пароль."
                )}
              </Text>
            )}
            <View style={styles.summaryActions}>
              <TouchableOpacity
                onPress={() => {
                  setPasswordMode("");
                  setCurrentAccountPassword("");
                  setNewFolderPassword("");
                }}
                disabled={passwordBusy}
                style={styles.smallButton}
                activeOpacity={0.86}
              >
                <Text style={styles.smallButtonText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitPasswordAction()}
                disabled={passwordBusy}
                style={[styles.smallButton, styles.primarySmallButton]}
                activeOpacity={0.86}
              >
                <Text style={styles.primarySmallButtonText}>
                  {passwordBusy ? t("common.saving") : t("common.save")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => void addPhoto()}
          disabled={busy || galleryLimitReached}
          style={[
            styles.addButton,
            busy || galleryLimitReached ? styles.addButtonDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.addButtonText,
              busy || galleryLimitReached ? styles.addButtonTextDisabled : null,
            ]}
          >
            {busy
              ? t("common.saving")
              : galleryLimitReached
                ? tt("photos.galleryLimitReachedTitle", "Лимит фото достигнут")
                : t("photos.add")}
          </Text>
        </TouchableOpacity>
        {galleryLimitReached ? (
          <Text style={styles.limitText}>
            {tt(
              "photos.galleryLimitReached",
              "Достигнут лимит фото. Удалите старые фото, чтобы добавить новые."
            )}
          </Text>
        ) : null}

        {pendingPhotoUri ? (
          <View style={styles.pendingCard}>
            <View style={styles.pendingImageWrap}>
              <CroppedMediaPreview
                uri={pendingPhotoUri}
                crop={pendingPhoto?.crop}
                style={styles.pendingImage}
                onError={() => {
                  setPendingPhoto(null);
                  Alert.alert(t("photos.previewFailed"), t("photos.noAssetReturned"));
                }}
              />
              {busy ? (
                <View style={styles.pendingOverlay}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text style={styles.pendingText}>
              {busy
                ? t("photos.uploading")
                : tt("photos.previewReady", "Проверьте фото перед загрузкой.")}
            </Text>
            <View style={styles.pendingActions}>
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => void confirmPendingPhotoUpload()}
                disabled={busy}
                style={[styles.smallButton, styles.primarySmallButton]}
              >
                <Text style={styles.primarySmallButtonText}>
                  {busy ? t("photos.uploading") : t("photos.uploadPhoto")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => void addPhoto()}
                disabled={busy}
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonText}>{t("photos.chooseAnother")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={() => setPendingPhoto(null)}
                disabled={busy}
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <ImageCropper
          visible={Boolean(croppingPhoto)}
          source={croppingPhoto}
          title={tt("photos.cropProfileTitle", "Обрезка фото")}
          helpText={tt(
            "photos.cropHelp",
            "Одним пальцем перемещайте фото, двумя — изменяйте масштаб."
          )}
          doneLabel={t("common.done")}
          cancelLabel={t("photos.cropCancel")}
          chooseAnotherLabel={t("photos.cropChooseAnother")}
          onDone={confirmPhotoCrop}
          onCancel={cancelPhotoCrop}
          onChooseAnother={() => void chooseAnotherPhotoForCrop()}
          onError={(step, error, metadata) => {
            reportCropError(step, "profile_photo", error, metadata);
            Alert.alert(t("photos.cropFailedTitle"), t("photos.cropFailedBody"));
          }}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tt("photos.publicSection", "Открытые фото")}</Text>
          {publicPhotos.length ? (
            <View style={styles.grid}>
              {publicPhotos.map((photo) => renderPhoto(photo, "public"))}
            </View>
          ) : (
            <Text style={styles.emptyText}>{t("photos.empty")}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {tt("photos.lockedSection", "Закрытая папка")}
          </Text>
          {lockedPhotos.length ? (
            <View style={styles.grid}>
              {lockedPhotos.map((photo) => renderPhoto(photo, "locked"))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {tt("photos.lockedEmpty", "Закрытых фото пока нет.")}
            </Text>
          )}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
    gap: 14,
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
  summaryCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(8, 12, 24, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 8,
  },
  passwordCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(10, 14, 26, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  summaryText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  helpText: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  summaryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smallButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  smallButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  primarySmallButton: {
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderColor: theme.buttons.primary.borderColor,
  },
  primarySmallButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
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
  addButton: {
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: 1,
    borderColor: theme.buttons.primary.borderColor,
    borderRadius: theme.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    backgroundColor: "rgba(201,120,104,0.12)",
    borderColor: "rgba(201,120,104,0.28)",
  },
  addButtonText: {
    color: theme.buttons.primary.textColor,
    fontWeight: "800",
    fontSize: 15,
  },
  addButtonTextDisabled: {
    color: "rgba(221,160,139,0.58)",
  },
  limitText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  pendingCard: {
    borderRadius: 18,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 8,
  },
  pendingImageWrap: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  pendingImage: {
    width: "100%",
    height: 176,
  },
  pendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  pendingText: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  pendingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoCard: {
    width: "48.2%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(8, 12, 24, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  photoImageWrap: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  photoImageError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    gap: 5,
    backgroundColor: "rgba(8, 12, 24, 0.92)",
  },
  photoImageErrorTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  photoImageErrorText: {
    color: theme.colors.subtext,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
  photoActions: {
    gap: 1,
  },
  photoActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  photoActionButtonDisabled: {
    opacity: 0.5,
  },
  photoActionText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.subtext,
  },
});
