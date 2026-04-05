import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";
import { theme } from "@/theme";
import ScreenShell from "@/components/ScreenShell";
import { getLikes } from "@/services/likes";
import { getPeerFromSession, type PlaySessionDoc } from "@/services/playSessions";
import { useLocale } from "@/contexts/LocaleContext";

type InboxSessionCard = {
  id: string;
  activity: string;
  status: string;
  peerId: string;
  peerName: string;
  dateLabel: string;
};

function asPlaySessionDoc(id: string, raw: unknown): PlaySessionDoc {
  const data = (raw ?? {}) as Partial<PlaySessionDoc>;
  return {
    id,
    activity: (data.activity ?? "draw") as PlaySessionDoc["activity"],
    status: (data.status ?? "matching") as PlaySessionDoc["status"],
    createdAt: Number(data.createdAt ?? 0),
    startedAt: Number(data.startedAt ?? data.createdAt ?? 0),
    ...(data.endedAt != null ? { endedAt: Number(data.endedAt) } : {}),
    participantIds: Array.isArray(data.participantIds)
      ? data.participantIds.map((value) => String(value))
      : [],
    participantNicknames:
      data.participantNicknames && typeof data.participantNicknames === "object"
        ? Object.fromEntries(
            Object.entries(data.participantNicknames).map(([key, value]) => [
              key,
              String(value ?? ""),
            ])
          )
        : {},
    ...(data.revealDecisions && typeof data.revealDecisions === "object"
      ? {
          revealDecisions: Object.fromEntries(
            Object.entries(data.revealDecisions).map(([key, value]) => [
              key,
              value === "open" ? "open" : "skip",
            ])
          ) as PlaySessionDoc["revealDecisions"],
        }
      : {}),
    ...(data.resultStrokeCount != null
      ? { resultStrokeCount: Number(data.resultStrokeCount) }
      : {}),
  };
}

function formatSessionDate(value: number) {
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

function getActivityLabel(activity: string) {
  if (activity === "draw") return "Нарисовать вместе";
  return activity;
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useLocale();
  const uid = auth?.currentUser?.uid ?? "";
  const [likesCount, setLikesCount] = useState(0);
  const [cards, setCards] = useState<InboxSessionCard[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ids = await getLikes();
        if (alive) setLikesCount(ids.length);
      } catch {
        // ignore errors fetching likes
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!db || !uid) {
      setCards([]);
      return;
    }

    const sessionsQuery = query(
      collection(db, "playSessions"),
      where("participantIds", "array-contains", uid)
    );

    const unsubscribe = onSnapshot(
      sessionsQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => asPlaySessionDoc(item.id, item.data()))
          .filter((session) => {
            if (session.participantIds.length < 2) return false;
            const decisions = session.revealDecisions;
            if (!decisions) return false;
            return session.participantIds.every(
              (participantId) => decisions[participantId] === "open"
            );
          })
          .map((session) => {
            const peer = getPeerFromSession(session, uid);
            if (!peer) return null;
            return {
              id: session.id,
              activity: getActivityLabel(session.activity),
              status: "Открыто",
              peerId: peer.uid,
              peerName: peer.nickname || t("common.user"),
              dateLabel: formatSessionDate(
                session.endedAt ?? session.startedAt ?? session.createdAt
              ),
            } satisfies InboxSessionCard;
          })
          .filter((item): item is InboxSessionCard => Boolean(item))
          .sort((a, b) => b.id.localeCompare(a.id));

        setCards(next);
      },
      () => {
        setCards([]);
      }
    );

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
          <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
            {t("common.likedCount", { count: String(likesCount) })}
          </Text>
        </View>

        {cards.length ? (
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
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: theme.colors.accentSoft,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {card.status}
                    </Text>
                  </View>
                </View>

                <Text
                  style={{
                    color: theme.colors.subtext,
                    fontSize: 14,
                    marginBottom: 8,
                  }}
                >
                  {card.activity}
                </Text>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: 12,
                  }}
                >
                  {card.dateLabel}
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
              Пока нет открытых диалогов
            </Text>
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 13,
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Здесь появятся пары из Parallel Play, где вы оба выбрали открыть чат
              после совместной сессии.
            </Text>
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
