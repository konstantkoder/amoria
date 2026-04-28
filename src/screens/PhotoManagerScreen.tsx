import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { deleteImage, uploadImage } from "@/services/storage";
import { getUserProfile, updateUserPhotos } from "@/services/user";
import { theme } from "@/theme";

const MAX_PHOTOS = 6;

export default function PhotoManagerScreen() {
  const { t } = useLocale();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [pendingPhotoUri, setPendingPhotoUri] = React.useState("");

  const refreshPhotos = React.useCallback(async () => {
    const profile = await getUserProfile();
    setPhotos(profile.photos ?? []);
    return profile;
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);

      void refreshPhotos()
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
    }, [refreshPhotos, t])
  );

  async function addPhoto() {
    let status = "";
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = permission.status;
    } catch {
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        selectionLimit: 1,
      });
    } catch {
      Alert.alert(t("photos.pickFailed"), t("photos.noAssetReturned"));
      return;
    }

    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri?.trim() ?? "";
    if (!result.assets || result.assets.length === 0 || !uri) {
      Alert.alert(t("photos.pickFailed"), t("photos.noAssetReturned"));
      return;
    }

    setPendingPhotoUri(uri);
    try {
      setBusy(true);
      let profile;
      try {
        profile = await getUserProfile();
      } catch {
        Alert.alert(t("photos.saveFailed"), t("photos.uploadErrorBody"));
        return;
      }

      let url = "";
      try {
        url = await uploadImage(profile.uid, uri);
      } catch {
        Alert.alert(t("photos.uploadFailed"), t("photos.uploadErrorBody"));
        return;
      }

      const next = [url, ...profile.photos].slice(0, MAX_PHOTOS);
      await updateUserPhotos(next);
      setPhotos(next);
      setPendingPhotoUri("");
      Alert.alert(t("common.done"), t("photos.saved"));
    } catch {
      Alert.alert(t("photos.saveFailed"), t("photos.uploadErrorBody"));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(index: number) {
    try {
      setBusy(true);
      const profile = await getUserProfile();
      const target = profile.photos[index];
      if (!target) return;

      try {
        await deleteImage(target);
      } catch (error: any) {
        const code = String(error?.code ?? error?.message ?? "");
        if (!code.includes("object-not-found")) {
          throw error;
        }
      }

      const next = profile.photos.filter((_, itemIndex) => itemIndex !== index);
      await updateUserPhotos(next);
      setPhotos(next);
    } catch {
      Alert.alert(t("photos.removeErrorTitle"), t("photos.removeErrorBody"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ScreenShell
        title={t("profile.photos")}
        background="profile"
        overlayOpacity={0.16}
        showBack
      >
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>{t("editProfile.loading")}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("profile.photos")}
      background="profile"
      overlayOpacity={0.16}
      showBack
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => void addPhoto()}
          disabled={busy}
          style={[styles.addButton, busy ? styles.addButtonDisabled : null]}
        >
          <Text style={styles.addButtonText}>
            {busy ? t("common.saving") : t("photos.add")}
          </Text>
        </TouchableOpacity>

        {pendingPhotoUri ? (
          <View style={styles.pendingCard}>
            <View style={styles.pendingImageWrap}>
              <Image
                source={{ uri: pendingPhotoUri }}
                style={styles.pendingImage}
                onError={() => {
                  setPendingPhotoUri("");
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
              {busy ? t("photos.uploading") : t("photos.choosePhoto")}
            </Text>
          </View>
        ) : null}

        {photos.length ? (
          <View style={styles.grid}>
            {photos.map((photo, index) => (
              <View key={`${photo}-${index}`} style={styles.photoCard}>
                <Image source={{ uri: photo }} style={styles.photoImage} />
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => void removePhoto(index)}
                  disabled={busy}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>{t("photos.remove")}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>{t("photos.empty")}</Text>
        )}
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
  addButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  addButtonDisabled: {
    opacity: 0.65,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  pendingCard: {
    borderRadius: 18,
    padding: 10,
    marginBottom: 14,
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
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  removeButton: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 12,
    color: theme.colors.subtext,
  },
});
