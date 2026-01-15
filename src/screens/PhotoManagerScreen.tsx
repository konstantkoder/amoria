import React, { useEffect, useState } from "react";
import { View, Text, Button, Image, FlatList, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ensureAuth,
  getUserProfile,
  updateUserPhotos,
} from "@/services/firebase";
import { uploadImage } from "@/services/storage";
import { theme } from "@/theme";
import { useLocale } from "@/contexts/LocaleContext";

export default function PhotoManagerScreen() {
  const { t } = useLocale();
  const [uid, setUid] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const id = await ensureAuth();
      setUid(id);
      const prof: any = await getUserProfile(id);
      setPhotos(prof?.photos || []);
    })();
  }, []);

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
    const uri = res.assets[0].uri;
    const url = await uploadImage(uid, uri);
    const next = [url, ...photos].slice(0, 6); // ограничим 6 фото
    setPhotos(next);
    await updateUserPhotos(uid, next);
  }

  async function removePhoto(index: number) {
    const next = photos.filter((_, i) => i !== index);
    setPhotos(next);
    await updateUserPhotos(uid, next);
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
