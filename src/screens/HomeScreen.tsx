
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function HomeScreen() {
  const user = auth.currentUser;

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Добро пожаловать 👋</Text>
      <Text style={{ marginBottom: 16 }}>{user?.email}</Text>
      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Выйти</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 6 },
  button: { padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
