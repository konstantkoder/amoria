import React, { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/config/firebaseConfig";
import { theme } from "@/theme/theme";

type Msg = { id: string; text: string };

export default function AdultsChatScreen() {
  const [accepted, setAccepted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!accepted) return;
    const qy = query(collection(db, "adults-global"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      setMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [accepted]);

  const send = async () => {
    const clean = text.trim();
    if (!clean) return;
    try {
      await addDoc(collection(db, "adults-global"), {
        text: clean,
        createdAt: serverTimestamp(),
      });
    } finally {
      setText("");
    }
  };

  if (!accepted) {
    return (
      <View style={styles.gate}>
        <Text style={styles.title}>Чат 18+</Text>
        <Text style={styles.copy}>
          Входя, вы подтверждаете совершеннолетие и соблюдение правил сообщества.
        </Text>
        <TouchableOpacity
          onPress={() => setAccepted(true)}
          style={styles.accept}
        >
          <Text style={styles.acceptTxt}>СОГЛАСЕН(А), ВОЙТИ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        inverted
        data={msgs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.msg}>
            <Text>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Сообщение…"
          style={styles.input}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}>
          <Text style={styles.sendTxt}>Отпр.</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, backgroundColor: theme.colors.bg, padding: 16, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 12, color: theme.colors.text },
  copy: { color: theme.colors.subtext, marginBottom: 16 },
  accept: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: theme.radius,
  },
  acceptTxt: { color: "#fff", textAlign: "center", fontWeight: "800" },
  msg: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  inputRow: { flexDirection: "row", padding: 10, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 12,
  },
  sendTxt: { color: "#fff", fontWeight: "800" },
});
