import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/theme";

type RoomCategory = "office" | "bar" | "cafe";

type Room = {
  id: string;
  title: string;
  description: string;
  distanceKm: number;
  activeCount: number;
  category: RoomCategory;
};

type RoomMessage = {
  id: string;
  author: "you" | "other";
  text: string;
  createdAt: string;
  reactions?: { like?: number; laugh?: number; fire?: number };
  voiceIntro?: string; // псевдо-голосовое интро ("~0:07" и т.п.)
  type?: "voice-demo";
};

const demoRooms: Room[] = [
  {
    id: "office",
    title: "Офис рядом",
    description: "Чат для сотрудников и соседних фрилансеров",
    distanceKm: 0.3,
    activeCount: 5,
    category: "office",
  },
  {
    id: "bar",
    title: "Бар на углу",
    description: "Бар сегодня шумный, но уютный 🍻",
    distanceKm: 0.7,
    activeCount: 8,
    category: "bar",
  },
  {
    id: "cafe",
    title: "Кофейня на площади",
    description: "Идеально для тихого общения и первых встреч",
    distanceKm: 1.2,
    activeCount: 3,
    category: "cafe",
  },
];

const demoMessagesByRoom: Record<string, RoomMessage[]> = {
  office: [
    {
      id: "m1",
      author: "other",
      text: "Кто идёт за кофе в ближайшие 10 минут? ☕",
      createdAt: "10 мин назад",
      reactions: { like: 2 },
      voiceIntro: "~0:07",
    },
    {
      id: "m2",
      author: "other",
      text: "Если что, я на 3 этаже, у окна.",
      createdAt: "8 мин назад",
    },
  ],
  bar: [
    {
      id: "m3",
      author: "other",
      text: "Бар сегодня очень живой. Кто рядом и хочет присоединиться? 🍹",
      createdAt: "5 мин назад",
      reactions: { fire: 3, laugh: 1 },
    },
  ],
  cafe: [
    {
      id: "m4",
      author: "other",
      text: "Сижу в углу у розетки. Можно подсесть, если нужно поработать вместе.",
      createdAt: "15 мин назад",
      voiceIntro: "~0:05",
    },
  ],
};

const demoParticipantsByRoom: Record<string, string[]> = {
  office: ["Анна", "Макс", "Лена", "Ты"],
  bar: ["Игорь", "Катя", "Сергей", "Ты"],
  cafe: ["Мария", "Олег", "Ты"],
};

const quickPhrasesByRoom: Record<string, string[]> = {
  office: [
    "Кто идёт за кофе?",
    "Есть желающие пообедать вместе?",
    "Нужен совет по проекту 👀",
  ],
  bar: [
    "Кто уже в баре?",
    "Заказываю первый раунд 🍻",
    "Где сидите? Не могу найти 🙈",
  ],
  cafe: [
    "Кто в кофейне сейчас?",
    "Можно подсесть к кому-то?",
    "Кто за совместный фокус-час? ☕",
  ],
};

function getRoomIconName(category: RoomCategory): keyof typeof Ionicons.glyphMap {
  switch (category) {
    case "office":
      return "briefcase-outline";
    case "bar":
      return "wine-outline";
    case "cafe":
    default:
      return "cafe-outline";
  }
}

// --- Компонент пузыря сообщения с реакциями и reply-свайпом ---

function MessageBubble({
  message,
  onReact,
  onReply,
}: {
  message: RoomMessage;
  onReact: (id: string, type: keyof NonNullable<RoomMessage["reactions"]>) => void;
  onReply: (id: string, text: string) => void;
}) {
  const isYou = message.author === "you";
  const slide = new Animated.Value(0);

  const triggerSwipe = () => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 180,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start(() => {
      onReply(message.id, message.text);
      slide.setValue(0);
    });
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onLongPress={triggerSwipe}
      style={{
        alignSelf: isYou ? "flex-end" : "flex-start",
        maxWidth: "80%",
        marginBottom: 10,
      }}
    >
      <Animated.View
        style={{
          transform: [
            {
              translateX: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [0, isYou ? -30 : 30],
              }),
            },
          ],
        }}
      >
        <View
          style={{
            backgroundColor: isYou ? theme.colors.accent : theme.colors.card,
            padding: 10,
            borderRadius: 18,
            borderBottomRightRadius: isYou ? 4 : 18,
            borderBottomLeftRadius: isYou ? 18 : 4,
          }}
        >
          <Text
            style={{
              color: isYou ? "#0B0B10" : theme.colors.text,
              fontSize: 14,
            }}
          >
            {message.text}
          </Text>

          {message.voiceIntro && (
            <View
              style={{
                marginTop: 6,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="mic-outline"
                size={14}
                color={isYou ? "#0B0B10" : theme.colors.muted}
              />
              <Text
                style={{
                  color: isYou ? "#0B0B10" : theme.colors.muted,
                  fontSize: 12,
                  marginLeft: 4,
                }}
              >
                Голосовое интро {message.voiceIntro}
              </Text>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: isYou ? "flex-end" : "flex-start",
            marginTop: 2,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 11,
              marginRight: 8,
            }}
          >
            {message.createdAt}
          </Text>

          <TouchableOpacity onPress={() => onReact(message.id, "like")}>
            <Text style={{ fontSize: 13, marginRight: 4 }}>👍</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReact(message.id, "laugh")}>
            <Text style={{ fontSize: 13, marginRight: 4 }}>😂</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReact(message.id, "fire")}>
            <Text style={{ fontSize: 13 }}>🔥</Text>
          </TouchableOpacity>
        </View>

        {message.reactions && (
          <View
            style={{
              flexDirection: "row",
              marginTop: 4,
              marginLeft: isYou ? 0 : 6,
            }}
          >
            {Object.entries(message.reactions)
              .filter(([_, count]) => count && count > 0)
              .map(([emoji, count]) => (
                <Text
                  key={emoji}
                  style={{
                    marginRight: 6,
                    fontSize: 12,
                    color: theme.colors.subtext,
                  }}
                >
                  {emoji === "like"
                    ? "👍"
                    : emoji === "laugh"
                    ? "😂"
                    : "🔥"}{" "}
                  {count}
                </Text>
              ))}
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// --- Основной экран комнат ---

export default function RoomsScreen() {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [input, setInput] = useState("");
  const [replyText, setReplyText] = useState<string | null>(null);
  const [isRecordingDemo, setIsRecordingDemo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleOpenRoom = (room: Room) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setSelectedRoom(room);
    setMessages(demoMessagesByRoom[room.id] ?? []);
    setReplyText(null);
    setInput("");
    setIsRecordingDemo(false);
    setRecordingSeconds(0);
  };

  const handleReact = (
    id: string,
    type: keyof NonNullable<RoomMessage["reactions"]>
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              reactions: {
                ...m.reactions,
                [type]: (m.reactions?.[type] || 0) + 1,
              },
            }
          : m
      )
    );
  };

  const handleReply = (id: string, text: string) => {
    setReplyText(text);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const baseText = input.trim();
    const finalText = replyText
      ? `↪ ${replyText.slice(0, 80)}\n${baseText}`
      : baseText;

    const newMessage: RoomMessage = {
      id: String(Date.now()),
      author: "you",
      text: finalText,
      createdAt: "только что",
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setReplyText(null);
  };

  const startDemoRecording = () => {
    if (isRecordingDemo) return;
    setIsRecordingDemo(true);
    setRecordingSeconds(0);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        const next = prev + 1;
        return next > 20 ? 20 : next;
      });
    }, 1000);
  };

  const stopDemoRecordingAndSend = () => {
    if (!isRecordingDemo) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setIsRecordingDemo(false);

    const secs = recordingSeconds < 3 ? 3 : recordingSeconds;
    const padded = secs < 10 ? `0${secs}` : `${secs}`;
    const durationLabel = `~0:${padded}`;
    const voiceText = `Голосовое сообщение ${durationLabel} (демо)`;
    const finalText = replyText
      ? `↪ ${replyText.slice(0, 80)}\n${voiceText}`
      : voiceText;

    setMessages((prev) => [
      ...prev,
      {
        id: `demo-voice-${Date.now()}`,
        type: "voice-demo",
        author: "you",
        text: finalText,
        createdAt: "только что",
        voiceIntro: durationLabel,
      },
    ]);

    setReplyText(null);
    setRecordingSeconds(0);
  };

  const handleMicPress = () => {
    if (!isRecordingDemo) {
      startDemoRecording();
    } else {
      stopDemoRecordingAndSend();
    }
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const handleShowInfo = () => {
    if (!selectedRoom) return;

    Alert.alert(
      selectedRoom.title,
      `Это демо-чат для комнаты "${selectedRoom.title}".\n\n` +
        "В полной версии здесь можно будет:\n" +
        "• видеть людей, которые сейчас в этой локации;\n" +
        "• договариваться о встречах прямо в чате;\n" +
        "• отправлять реальные голосовые и фото.\n\n" +
        "Пока всё локально и безопасно — можно просто поиграться с интерфейсом. 🙂",
      [{ text: "Понятно", style: "default" }]
    );
  };

  const handlePickQuickPhrase = (phrase: string) => {
    // подставляем фразу в инпут, но не отправляем сразу
    if (input.trim().length === 0) {
      setInput(phrase);
    } else {
      setInput((prev) => prev + (prev.endsWith(" ") ? "" : " ") + phrase);
    }
  };

  // --- Экран списка комнат ---

  if (!selectedRoom) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 28,
              fontWeight: "800",
              marginBottom: 8,
            }}
          >
            Комнаты
          </Text>
          <Text
            style={{
              color: theme.colors.subtext,
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            Общие чаты для офисов, баров, кофеен и ивентов поблизости. Выбери
            комнату, чтобы открыть демо-чат.
          </Text>

          {demoRooms.map((r) => (
            <TouchableOpacity
              key={r.id}
              activeOpacity={0.9}
              onPress={() => handleOpenRoom(r)}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 22,
                padding: 16,
                marginBottom: 16,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={getRoomIconName(r.category)}
                size={26}
                color={theme.colors.accent}
                style={{ marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  {r.title}
                </Text>
                <Text
                  style={{
                    color: theme.colors.subtext,
                    fontSize: 13,
                    marginTop: 2,
                    marginBottom: 6,
                  }}
                >
                  {r.description}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="location-outline"
                    size={13}
                    color={theme.colors.muted}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontSize: 12,
                      marginRight: 8,
                    }}
                  >
                    ~{r.distanceKm.toFixed(1)} км
                  </Text>
                  <View
                    style={{
                      height: 4,
                      width: 4,
                      borderRadius: 2,
                      backgroundColor: "#22c55e",
                      marginRight: 4,
                    }}
                  />
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontSize: 12,
                    }}
                  >
                    Сейчас в чате: {r.activeCount}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Экран конкретной комнаты ---

  const participants = demoParticipantsByRoom[selectedRoom.id] ?? ["Ты"];
  const quickPhrases = quickPhrasesByRoom[selectedRoom.id] ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Хидер комнаты */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
        }}
      >
        <TouchableOpacity onPress={() => setSelectedRoom(null)}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {selectedRoom.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
            <Ionicons
              name="location-outline"
              size={12}
              color={theme.colors.muted}
              style={{ marginRight: 4 }}
            />
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 11,
                marginRight: 8,
              }}
            >
              ~{selectedRoom.distanceKm.toFixed(1)} км
            </Text>
            <View
              style={{
                height: 4,
                width: 4,
                borderRadius: 2,
                backgroundColor: "#22c55e",
                marginRight: 4,
              }}
            />
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 11,
              }}
            >
              В чате: {selectedRoom.activeCount}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleShowInfo}>
          <Ionicons name="information-circle-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Участники */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          backgroundColor: "rgba(15,23,42,0.8)",
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {participants.map((name, index) => {
            const initial = name === "Ты" ? "Ты" : name.charAt(0).toUpperCase();
            const isYou = name === "Ты";

            return (
              <View
                key={`${name}-${index}`}
                style={{
                  marginRight: 12,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: isYou ? theme.colors.accent : theme.colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isYou ? "#0B0B10" : theme.colors.text,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    {initial}
                  </Text>
                </View>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  {isYou ? "Ты" : name.split(" ")[0]}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Основной чат + быстрые фразы и инпут */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 24,
          }}
        >
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onReact={handleReact}
              onReply={handleReply}
            />
          ))}
        </ScrollView>

        {/* Быстрые фразы */}
        {quickPhrases.length > 0 && (
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.06)",
              backgroundColor: "rgba(15,23,42,0.9)",
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {quickPhrases.map((phrase) => (
                <TouchableOpacity
                  key={phrase}
                  onPress={() => handlePickQuickPhrase(phrase)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: "rgba(148,163,184,0.2)",
                    marginRight: 8,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 12,
                    }}
                  >
                    {phrase}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {isRecordingDemo && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingTop: 6,
              paddingBottom: 2,
            }}
          >
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 12,
              }}
            >
              Идёт демо-запись голосового… 0:
              {recordingSeconds.toString().padStart(2, "0")}
            </Text>
          </View>
        )}

        {/* Поле ввода сообщения */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 10,
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.08)",
          }}
        >
          {/* Кнопка псевдо-голосового интро */}
          <TouchableOpacity
            onPress={handleMicPress}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 8,
              backgroundColor: isRecordingDemo
                ? theme.colors.accent
                : "rgba(15,23,42,0.9)",
              borderWidth: isRecordingDemo ? 1 : 0,
              borderColor: isRecordingDemo ? "rgba(249,115,22,0.7)" : "transparent",
            }}
          >
            <Ionicons
              name={isRecordingDemo ? "mic" : "mic-outline"}
              size={18}
              color={isRecordingDemo ? theme.colors.background : theme.colors.muted}
            />
          </TouchableOpacity>

          <TextInput
            placeholder="Напиши сообщение..."
            placeholderTextColor={theme.colors.muted}
            value={input}
            onChangeText={setInput}
            style={{
              flex: 1,
              backgroundColor: theme.colors.card,
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              color: theme.colors.text,
              fontSize: 14,
              marginRight: 8,
            }}
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: input.trim()
                ? theme.colors.accent
                : "rgba(148,163,184,0.3)",
            }}
          >
            <Ionicons
              name="send"
              size={18}
              color={input.trim() ? "#0B0B10" : theme.colors.background}
            />
          </TouchableOpacity>
        </View>

        {/* Строка с reply-инфо */}
        {replyText && (
          <View
            style={{
              position: "absolute",
              bottom: 60,
              left: 12,
              right: 12,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: "rgba(15,23,42,0.95)",
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.4)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="return-up-forward-outline"
                size={14}
                color={theme.colors.muted}
                style={{ marginRight: 6 }}
              />
              <Text
                style={{
                  color: theme.colors.subtext,
                  fontSize: 12,
                  flex: 1,
                }}
              >
                Ответ на: {replyText.slice(0, 80)}...
              </Text>
              <TouchableOpacity onPress={() => setReplyText(null)}>
                <Ionicons
                  name="close"
                  size={14}
                  color={theme.colors.muted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
