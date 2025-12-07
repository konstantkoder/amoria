import React, { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import { theme } from "@/theme";

export default function ProfileFormScreen({ navigation }: any) {
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("1990-01-01");
  const [gender, setGender] = useState<
    "male" | "female" | "other" | undefined
  >();

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
        Профиль
      </Text>
      <Text>Имя</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Ваше имя"
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />
      <Text>Дата рождения (YYYY-MM-DD)</Text>
      <TextInput
        value={birthdate}
        onChangeText={setBirthdate}
        placeholder="1990-01-01"
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 12,
        }}
      />
      <Text>Пол (male/female/other)</Text>
      <TextInput
        value={gender as any}
        onChangeText={(t) => setGender(t as any)}
        placeholder="female"
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 24,
        }}
      />
      <Button
        title="Далее"
        onPress={() =>
          navigation.navigate("PreferencesForm", {
            displayName,
            birthdate,
            gender,
          })
        }
      />
    </View>
  );
}
