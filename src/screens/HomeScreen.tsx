import React, { useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "@/config/firebaseConfig";

export default function HomeScreen() {
  const user = auth?.currentUser;

  const logout = useCallback(async () => {
    try {
      if (!auth) {
        Alert.alert("Выход", "Firebase не настроен. Выход недоступен.");
        return;
      }
      await signOut(auth);
    } catch (e) {
      console.error(e);
      Alert.alert("Ошибка", "Не удалось выйти.");
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Добро пожаловать 👋</Text>
      <Text style={{ marginBottom: 16 }}>{user?.email ?? "Гость"}</Text>
      <TouchableOpacity style={styles.button} onPress={logout} disabled={!user}>
        <Text style={styles.buttonText}>
          {user ? "Выйти" : "Не авторизован"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 6 },
  button: { padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
