import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "@/config/firebaseConfig";
import { theme } from "@/theme";
import ScreenShell from "@/components/ScreenShell";
import { mapDmThreadToPeer, subscribeDmThreads, type DmThreadDoc } from "@/services/dm";
import { useLocale } from "@/contexts/LocaleContext";

type InboxThreadCard = {
  id: string;
  peerId: string;
  peerName: string;
  sourceLabel: string;
  previewText: string;
  dateLabel: string;
  sortAt: number;
};

function formatThreadDate(value: number) {
  if (!value) return "Сейчас";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function mapThreadToCard(thread: DmThreadDoc, uid: string, fallbackName: string) {
  const peer = mapDmThreadToPeer(thread, uid);
  if (!peer) return null;

  const sortAt = thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt;
  return {
    id: thread.id,
    peerId: peer.uid,
    peerName: peer.name || fallbackName,
    sourceLabel: thread.source === "play" ? "Нарисовали вместе" : "Диалог",
    previewText: thread.lastMessageText?.trim() || "Чат открыт после совместной сессии.",
    dateLabel: formatThreadDate(sortAt),
    sortAt,
  } satisfies InboxThreadCard;
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useLocale();
  const uid = auth?.currentUser?.uid ?? "";
  const [cards, setCards] = useState<InboxThreadCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !uid) {
      setCards([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeDmThreads(db, uid, (threads) => {
      const next = threads
        .map((thread) => mapThreadToCard(thread, uid, t("common.user")))
        .filter((item): item is InboxThreadCard => Boolean(item))
        .sort((a, b) => b.sortAt - a.sortAt);

      setCards(next);
      setLoading(false);
    });

    return unsubscribe;
  }, [t, uid]);

  return (
    <ScreenShell
      title={t("tabs.chats")}
      background="chats"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            {t("tabs.chats")}
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{cards.length}</Text>
        </View>

        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
              gap: 12,
            }}
          >
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={{ color: theme.colors.subtext, fontSize: 14, textAlign: "center" }}>
              Подключаем чаты…
            </Text>
          </View>
        ) : cards.length ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: 12, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {cards.map((card) => (
              <Pressable
                key={card.id}
                onPress={() =>
                  navigation.navigate("DMChat", {
                    threadId: card.id,
                    peerId: card.peerId,
                    peerName: card.peerName,
                  })
                }
                style={{
                  backgroundColor: "rgba(17, 20, 36, 0.86)",
                  borderRadius: 22,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.borderSubtle,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 17,
                      fontWeight: "800",
                      flex: 1,
                    }}
                  >
                    {card.peerName}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.muted,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {card.dateLabel}
                  </Text>
                </View>

                <Text
                  style={{
                    color: theme.colors.accent,
                    fontSize: 13,
                    fontWeight: "700",
                    marginBottom: 8,
                  }}
                >
                  {card.sourceLabel}
                </Text>
                <Text
                  style={{
                    color: theme.colors.subtext,
                    fontSize: 14,
                    lineHeight: 20,
                  }}
                  numberOfLines={2}
                >
                  {card.previewText}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
            }}
          >
            <View
              style={{
                width: 78,
                height: 78,
                borderRadius: 39,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 78, 138, 0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Ionicons
                name="chatbubbles-outline"
                size={34}
                color={theme.colors.primary}
              />
            </View>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 18,
                fontWeight: "800",
                textAlign: "center",
                marginTop: 18,
                marginBottom: 8,
              }}
            >
              Пока пусто
            </Text>
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 13,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Пока пусто. Открой кого-то после совместной сессии, и здесь появится чат.
            </Text>
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
