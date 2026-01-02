import React, { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { orderBy, query, onSnapshot } from "firebase/firestore";
import { useRoute } from "@react-navigation/native";
import { auth } from "@/config/firebaseConfig";
import { messagesRef, sendMessage } from "@/services/swipe";
import ScreenShell from "@/components/ScreenShell";

type Message = {
  id: string;
  text: string;
  author: string;
};

export default function ChatScreen() {
  const { params } = useRoute<any>();
  const chatId = params?.chatId as string;
  const me = auth?.currentUser?.uid;
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!chatId) return;
    const q = query(messagesRef(chatId), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Message[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setMessages(arr);
    });
    return unsub;
  }, [chatId]);

  const onSend = () => {
    if (!chatId || !text.trim()) return;
    sendMessage(chatId, text);
    setText("");
  };

  return (
    <ScreenShell
      title="Чат"
      background="nightCity"
      debugTint={false}
      showBack
    >
      <KeyboardAvoidingView
        style={{ flex: 1, padding: 12 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.author === me ? "flex-end" : "flex-start",
                backgroundColor: item.author === me ? "#c7d2fe" : "#e5e7eb",
                borderRadius: 12,
                padding: 10,
                marginVertical: 4,
                maxWidth: "80%",
              }}
            >
              <Text>{item.text}</Text>
            </View>
          )}
        />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Сообщение…"
            style={{
              flex: 1,
              backgroundColor: "#fff",
              borderRadius: 10,
              paddingHorizontal: 12,
              height: 44,
            }}
          />
          <TouchableOpacity
            onPress={onSend}
            style={{
              backgroundColor: "#6d28d9",
              height: 44,
              borderRadius: 10,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Отпр.</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
