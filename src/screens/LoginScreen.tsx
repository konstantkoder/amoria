
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const signUp = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };

  const signIn = async () => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Amoria 🚀</Text>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Пароль"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={signUp}>
        <Text style={styles.buttonText}>Регистрация</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondary]} onPress={signIn}>
        <Text style={styles.buttonText}>Войти</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 16,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  button: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
    borderWidth: 1,
  },
  secondary: {
    opacity: 0.9,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  error: { color: "red", textAlign: "center" },
});
