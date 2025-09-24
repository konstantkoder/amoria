import React from "react";
import { SafeAreaView, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

// просто импортнём, чтобы инициализация случилась один раз
import "./src/config/firebaseConfig";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Amoria ready 🚀</Text>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "600" }
});
