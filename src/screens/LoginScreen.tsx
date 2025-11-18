import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/config/firebaseConfig";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Вход", e?.message ?? "Ошибка входа");
    }
  };

  const register = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      Alert.alert("Регистрация", "Успешно!");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Регистрация", e?.message ?? "Ошибка регистрации");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Вход</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={login}>
        <Text style={styles.buttonText}>Войти</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { marginTop: 8 }]}
        onPress={register}
      >
        <Text style={styles.buttonText}>Зарегистрироваться</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: "stretch",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginVertical: 6 },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
