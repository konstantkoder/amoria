import React, { useEffect, useState } from "react";
import { View, Text, Button, Image, FlatList, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { auth, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  ensureAuth,
  getUserProfile as getDemoUserProfile,
  updateUserPhotos as updateDemoUserPhotos,
} from "@/services/firebase";
import {
  getUserProfile as getRemoteUserProfile,
  updateUserFields,
} from "@/services/user";
import { uploadImage } from "@/services/storage";
import { theme } from "@/theme";
import { useLocale } from "@/contexts/LocaleContext";

export default function PhotoManagerScreen() {
  const { t } = useLocale();
  const [uid, setUid] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const firebaseConfigured = isFirebaseConfigured();

  useEffect(() => {
    (async () => {
      if (firebaseConfigured) {
        const currentUid = auth?.currentUser?.uid;
        if (!currentUid) {
          Alert.alert(t("now.signInTitle"));
          return;
        }
        setUid(currentUid);
        const prof: any = await getRemoteUserProfile();
        setPhotos(prof?.photos || []);
        return;
      }
      const id = await ensureAuth();
      setUid(id);
      const prof: any = await getDemoUserProfile(id);
      setPhotos(prof?.photos || []);
    })();
  }, [firebaseConfigured, t]);

  async function addPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        t("photos.permissionTitle"),
        t("photos.permissionBody"),
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (res.canceled) return;
    let activeUid = uid;
    if (firebaseConfigured) {
      activeUid = auth?.currentUser?.uid ?? "";
      if (!activeUid) {
        Alert.alert(t("now.signInTitle"));
        return;
      }
    } else if (!activeUid) {
      activeUid = await ensureAuth();
      setUid(activeUid);
    }
    const uri = res.assets[0].uri;
    const url = await uploadImage(activeUid, uri);
    const next = [url, ...photos].slice(0, 6); // ограничим 6 фото
    setPhotos(next);
    if (firebaseConfigured) {
      await updateUserFields({ photos: next });
    } else {
      await updateDemoUserPhotos(activeUid, next);
    }
  }

  async function removePhoto(index: number) {
    let activeUid = uid;
    if (firebaseConfigured) {
      activeUid = auth?.currentUser?.uid ?? "";
      if (!activeUid) {
        Alert.alert(t("now.signInTitle"));
        return;
      }
    } else if (!activeUid) {
      activeUid = await ensureAuth();
      setUid(activeUid);
    }
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    if (firebaseConfigured) {
      await updateUserFields({ photos: next });
    } else {
      await updateDemoUserPhotos(activeUid, next);
    }
  }

  return (
    <View
      style={{ flex: 1, padding: 16, backgroundColor: theme.colors.background }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        {t("profile.photos")}
      </Text>
      <Button title={t("photos.add")} onPress={addPhoto} />
      <FlatList
        data={photos}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        numColumns={2}
        renderItem={({ item, index }) => (
          <View
            style={{
              margin: 8,
              width: "46%",
              aspectRatio: 1,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "#eee",
            }}
          >
            <Image
              source={{ uri: item }}
              style={{ width: "100%", height: "100%" }}
            />
            <Button title={t("photos.remove")} onPress={() => removePhoto(index)} />
          </View>
        )}
      />
      {photos.length === 0 && (
        <Text style={{ marginTop: 12, opacity: 0.7 }}>
          {t("photos.empty")}
        </Text>
      )}
    </View>
  );
}
