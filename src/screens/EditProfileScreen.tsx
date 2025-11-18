import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import {
  ensureAuth,
  getUserProfile,
  updateUserFields,
} from "@/services/firebase";
import { theme } from "@/theme/theme";
import type { Goal, Mood } from "@src/models/User";

export default function EditProfileScreen({ navigation }: any) {
  const [uid, setUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [interests, setInterests] = useState("");
  const [goal, setGoal] = useState("dating");
  const [mood, setMood] = useState("happy");

  useEffect(() => {
    (async () => {
      const id = await ensureAuth();
      setUid(id);
      const p: any = await getUserProfile(id);
      if (p) {
        setDisplayName(p.displayName || "");
        setAbout(p.about || "");
        setInterests((p.interests || []).join(", "));
        setGoal(p.goal || "dating");
        setMood(p.mood || "happy");
      }
    })();
  }, []);

  async function save() {
    await updateUserFields(uid, {
      displayName,
      about,
      interests: interests
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
      goal: goal as Goal,
      mood: mood as Mood,
    });
    Alert.alert("Сохранено", "Профиль обновлен");
    navigation.goBack();
  }

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Редактировать профиль
      </Text>
      <Text>Имя</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />
      <Text>О себе</Text>
      <TextInput
        value={about}
        onChangeText={setAbout}
        multiline
        numberOfLines={3}
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
          height: 90,
        }}
      />
      <Text>Интересы (через запятую)</Text>
      <TextInput
        value={interests}
        onChangeText={setInterests}
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />
      <Text>Цель</Text>
      <TextInput
        value={goal}
        onChangeText={setGoal}
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />
      <Text>Настроение</Text>
      <TextInput
        value={mood}
        onChangeText={setMood}
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 24,
        }}
      />
      <Button title="Сохранить" onPress={save} />
    </View>
  );
}
