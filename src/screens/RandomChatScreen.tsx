import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { ensureAuth } from "@/services/firebase";
import { isFirebaseConfigured, db } from "@/config/firebaseConfig";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  limit,
  updateDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { theme } from "@/theme";

type RoomType = "any" | "office" | "bar" | "campus" | "cowork";

const ROOM_OPTIONS: { id: RoomType; label: string; emoji: string }[] = [
  { id: "any", emoji: "🎲", label: "Любой" },
  { id: "office", emoji: "🏢", label: "Работа" },
  { id: "bar", emoji: "🍺", label: "Бар / паб" },
  { id: "campus", emoji: "🎓", label: "Кампус" },
  { id: "cowork", emoji: "💻", label: "Коворкинг" },
];

function formatRoomLabel(type: RoomType): string {
  const found = ROOM_OPTIONS.find((r) => r.id === type);
  if (!found) return "Любая комната";
  return `${found.emoji} ${found.label}`;
}

export default function RandomChatScreen() {
  const [roomId, setRoomId] = useState<string>("");
  const [uid, setUid] = useState<string>("");
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("any");
  const connectingRef = useRef(false);

  useEffect(() => {
    if (roomId || connectingRef.current) return;
    connectingRef.current = true;

    let cleanup: (() => void) | undefined;

    (async () => {
      const id = await ensureAuth();
      setUid(id);
      if (isFirebaseConfigured()) {
        const database = db;
        if (!database) {
          return;
        }

        let resolvedRoomId: string | null = null;

        const q = query(
          collection(database, "randomRooms"),
          where("users", "array-contains", "__empty__"),
          limit(1),
        );
        const res = await getDocs(q);
        if (!res.empty) {
          const room = res.docs[0];
          await updateDoc(doc(database, "randomRooms", room.id), {
            users: [room.data().users[0], id],
          });
          resolvedRoomId = room.id;
        } else {
          const nd = await addDoc(collection(database, "randomRooms"), {
            users: ["__empty__", id],
            createdAt: Date.now(),
            topic: roomType,
          });
          resolvedRoomId = nd.id;
        }

        if (!resolvedRoomId) {
          return;
        }

        setRoomId(resolvedRoomId);
        const mq = query(
          collection(database, "randomRooms", resolvedRoomId, "messages"),
        );
        const unsub = onSnapshot(mq, (snap) => {
          setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as any));
        });
        cleanup = unsub;
        connectingRef.current = false;
      } else {
        // mock: local-only message buffer
        const rid = "mock-room";
        setRoomId(rid);
        await AsyncStorage.setItem(
          "mock_room_meta",
          JSON.stringify({ topic: roomType }),
        );
        const raw = await AsyncStorage.getItem("mock_msgs");
        setMessages(raw ? JSON.parse(raw) : []);
        connectingRef.current = false;
      }
    })();

    return () => {
      connectingRef.current = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [roomType, roomId]);

  async function send() {
    if (!text.trim()) return;
    if (isFirebaseConfigured()) {
      const database = db;
      if (!database) {
        return;
      }

      await addDoc(collection(database, "randomRooms", roomId, "messages"), {
        from: uid,
        text,
        createdAt: Date.now(),
      });
    } else {
      const msg = {
        id: String(Date.now()),
        from: uid,
        text,
        createdAt: Date.now(),
      };
      const next = [...messages, msg];
      setMessages(next);
      await AsyncStorage.setItem("mock_msgs", JSON.stringify(next));
    }
    setText("");
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: 12 }}>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 18,
          fontWeight: "800",
          marginBottom: 6,
        }}
      >
        Случайный чат
      </Text>

      <View
        style={{
          marginTop: 8,
          marginBottom: 12,
          flexDirection: "row",
          flexWrap: "wrap",
        }}
      >
        {ROOM_OPTIONS.map((opt) => {
          const isActive = opt.id === roomType;
          return (
            <TouchableOpacity
              key={opt.id}
              onPress={() => setRoomType(opt.id)}
              activeOpacity={0.9}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: isActive ? "#F97316" : "#4B5563",
                backgroundColor: isActive
                  ? "rgba(249,115,22,0.12)"
                  : "rgba(15,23,42,0.7)",
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  marginRight: 4,
                }}
              >
                {opt.emoji}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#E5E7EB",
                  fontWeight: isActive ? "700" : "500",
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text
        style={{
          fontSize: 12,
          color: "#9CA3AF",
          marginBottom: 12,
        }}
      >
        Пока это демо-комнаты. В полной версии подбор собеседника будет
        учитывать выбранное место или настроение.
      </Text>

      <View
        style={{
          marginBottom: 8,
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            color: "#9CA3AF",
          }}
        >
          Сейчас комната: {formatRoomLabel(roomType)}
        </Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.from === uid ? "flex-end" : "flex-start",
              backgroundColor: "#fff",
              padding: 8,
              borderRadius: 12,
              marginVertical: 4,
              maxWidth: "80%",
            }}
          >
            <Text>{item.text}</Text>
          </View>
        )}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Сообщение..."
          style={{
            flex: 1,
            backgroundColor: "#fff",
            padding: 12,
            borderRadius: 12,
          }}
        />
        <Button title="Отпр." onPress={send} />
      </View>
    </View>
  );
}
