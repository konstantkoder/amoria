import React from "react";
import { View, Text, Button, Alert } from "react-native";
import { askLocationPermission } from "@/services/geo";
import { theme } from "@/theme";

export default function PermissionsScreen({ navigation }: any) {
  async function request() {
    try {
      await askLocationPermission();
      navigation.navigate("ProfileForm");
    } catch (e: any) {
      Alert.alert(
        "Разрешение не выдано",
        "Вы сможете включить его позже в настройках устройства.",
      );
      navigation.navigate("ProfileForm");
    }
  }
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        justifyContent: "center",
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Доступ к локации
      </Text>
      <Text style={{ marginBottom: 24 }}>
        Локация используется только когда вы в приложении — чтобы показать людей
        рядом. Фоновый доступ не требуется.
      </Text>
      <Button title="Разрешить и продолжить" onPress={request} />
    </View>
  );
}
