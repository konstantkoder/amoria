import React, { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRoute } from "@react-navigation/native";
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

export default function DMChatScreen() {
  const route = useRoute<any>();
  const peerId = route.params?.peerId ?? "demo-peer";
  const peerName = route.params?.peerName ?? "Пользователь";
  const threadId = ["me", peerId].sort().join("__");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<any[]>([]);

  useEffect(() => {
    const qy = query(
      collection(db, "dm", threadId, "messages"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(qy, (snap) => {
      setMsgs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [threadId]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await addDoc(collection(db, "dm", threadId, "messages"), {
        text: text.trim(),
        to: peerId,
        createdAt: serverTimestamp(),
      });
    } finally {
      setText("");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={styles.header}>
        <Text style={styles.headerTxt}>Диалог с {peerName}</Text>
      </View>
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
  header: { padding: 16 },
  headerTxt: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
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
