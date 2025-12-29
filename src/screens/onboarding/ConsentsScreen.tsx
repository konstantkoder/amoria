import React, { useState } from "react";
import { View, Text, Button, Switch, Linking, Alert } from "react-native";
import { theme } from "@/theme";
import ScreenBackground from "@/components/ScreenBackground";

export default function ConsentsScreen({ navigation }: any) {
  const [tos, setTos] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  const canNext = tos && privacy;

  return (
    <ScreenBackground variant="hearts" overlayOpacity={0.15} blurRadius={0}>
      <View style={{ flex: 1, padding: 24, backgroundColor: "transparent" }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
          Согласия
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Switch value={tos} onValueChange={setTos} />
          <Text
            style={{ marginLeft: 12, flex: 1 }}
            onPress={() => navigation.navigate("Legal")}
          >
            Я согласен с Условиями использования
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Switch value={privacy} onValueChange={setPrivacy} />
          <Text
            style={{ marginLeft: 12, flex: 1 }}
            onPress={() => navigation.navigate("Legal")}
          >
            Я согласен с Политикой конфиденциальности
          </Text>
        </View>
        <Button
          title="Далее"
          onPress={() => navigation.navigate("Permissions")}
          disabled={!canNext}
        />
      </View>
    </ScreenBackground>
  );
}
