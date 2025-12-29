import React, { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import { theme } from "@/theme";
import ScreenBackground from "@/components/ScreenBackground";

export default function PreferencesFormScreen({ route, navigation }: any) {
  const { displayName, birthdate, gender } = route.params || {};
  const [interests, setInterests] = useState("путешествия,спорт,музыка");
  const [goal, setGoal] = useState("dating");
  const [mood, setMood] = useState("happy");

  return (
    <ScreenBackground variant="hearts" overlayOpacity={0.15} blurRadius={0}>
      <View style={{ flex: 1, padding: 24, backgroundColor: "transparent" }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
          Интересы и цели
        </Text>
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
        <Text>Цель (dating/friends/chat/long_term/short_term)</Text>
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
        <Text>Настроение (happy/chill/active/serious/party)</Text>
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
        <Button
          title="Сохранить"
          onPress={() =>
            navigation.navigate("Finish", {
              displayName,
              birthdate,
              gender,
              interests,
              goal,
              mood,
            })
          }
        />
      </View>
    </ScreenBackground>
  );
}
