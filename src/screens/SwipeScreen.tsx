import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { theme } from "@/theme/theme";
import { ensureAuth, swipeOn } from "@/services/firebase";
import { fetchCandidates, superLikeUser } from "@/services/swipe";
import ProfileCard from "@/components/ProfileCard";
import { db } from "@/config/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

const { width } = Dimensions.get("window");
const SWIPE_X = width * 0.25;

type CardUser = {
  id: string;
  name: string;
  age?: number;
  avatar?: string;
  bio?: string;
  interests?: string[];
  photos?: string[];
  verified?: boolean;
};

function fallbackUsers(): CardUser[] {
  return [
    {
      id: "1",
      name: "Alex",
      age: 27,
      bio: "Путешествия, кофе, винил",
      interests: ["travel", "coffee"],
    },
    {
      id: "2",
      name: "Mira",
      age: 24,
      bio: "Йога и кино по вечерам",
      interests: ["yoga", "cinema"],
    },
    {
      id: "3",
      name: "Dan",
      age: 29,
      bio: "Хайкинг, бег, борщ 😅",
      interests: ["hiking", "running"],
    },
    {
      id: "4",
      name: "Ira",
      age: 25,
      bio: "Пишу музыку и люблю панк-рок",
      interests: ["music", "punk"],
    },
    {
      id: "5",
      name: "Leo",
      age: 31,
      bio: "Фотограф, ищу приятные беседы",
      interests: ["photo", "chat"],
    },
  ];
}

export default function SwipeScreen() {
  const [index, setIndex] = useState(0);
  const [users, setUsers] = useState<CardUser[]>([]);
  const [justMatched, setJustMatched] = useState(false);
  const [myInterestsRaw, setMyInterestsRaw] = useState<string[]>([]);

  const loadMore = useCallback(async () => {
    try {
      const got = await fetchCandidates(12);
      setUsers(got.length ? got : fallbackUsers());
    } catch {
      setUsers(fallbackUsers());
    } finally {
      setIndex(0);
    }
  }, []);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    (async () => {
      try {
        const uid = await ensureAuth();
        const snap = await getDoc(doc(db, "profiles", uid));
        const data = snap.exists()
          ? (snap.data() as Record<string, any>)
          : null;
        const interests = Array.isArray(data?.interests)
          ? data?.interests.filter((s: any) => typeof s === "string")
          : [];
        setMyInterestsRaw(interests as string[]);
      } catch {
        setMyInterestsRaw([]);
      }
    })();
  }, []);

  const myInterests = useMemo(() => myInterestsRaw, [myInterestsRaw]);

  const topUser = users[index];
  const nextUser = users[index + 1];

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const onNext = useCallback(() => {
    setIndex((prev) => {
      const next = Math.min(prev + 1, users.length);
      if (next >= users.length - 1) {
        loadMore();
      }
      return next;
    });
  }, [loadMore, users.length]);

  const showMatch = useCallback(() => {
    setJustMatched(true);
    setTimeout(() => setJustMatched(false), 1500);
  }, []);

  const handleSwipe = useCallback(
    (right: boolean, targetId?: string) => {
      if (!targetId) return;
      if (right) {
        swipeOn(targetId, "like")
          .then((res) => {
            if (res?.matched) {
              showMatch();
              return;
            }
            if (!res?.matched && !res?.quotaLeft) {
              Alert.alert("Лимит лайков", "На сегодня лимит лайков исчерпан");
            }
          })
          .catch(() => {});
      } else {
        swipeOn(targetId, "pass").catch(() => {});
      }
    },
    [showMatch],
  );

  const doSuperLike = useCallback(
    (targetId?: string) => {
      if (!targetId) return;
      superLikeUser(targetId)
        .then((res) => {
          if (res?.matched) {
            showMatch();
            return;
          }
          if (!res?.matched && !res?.quotaLeft) {
            Alert.alert(
              "Лимит суперлайков",
              "На сегодня лимит суперлайков исчерпан",
            );
          }
        })
        .catch(() => {});
    },
    [showMatch],
  );

  const pan = Gesture.Pan()
    .onChange((event) => {
      translateX.value += event.changeX;
      translateY.value += event.changeY;
    })
    .onEnd(() => {
      const shouldSwipe = Math.abs(translateX.value) > SWIPE_X;
      if (shouldSwipe) {
        const right = translateX.value > 0;
        const dir = right ? 1 : -1;
        const targetId = topUser?.id;
        translateX.value = withTiming(
          dir * width * 1.2,
          { duration: 180 },
          () => {
            translateX.value = 0;
            translateY.value = 0;
            runOnJS(handleSwipe)(right, targetId);
            runOnJS(onNext)();
          },
        );
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(doSuperLike)(topUser?.id);
    });

  const topStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-width, 0, width],
      [-12, 0, 12],
      Extrapolate.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const nextStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_X],
      [0.9, 1],
      Extrapolate.CLAMP,
    );
    return { transform: [{ scale }] };
  });

  const Card = ({ user }: { user: CardUser }) => (
    <ProfileCard
      profile={{
        id: user.id,
        name: user.name,
        age: user.age,
        bio: user.bio,
        interests: user.interests,
        photos: user.photos?.length
          ? user.photos
          : user.avatar
            ? [user.avatar]
            : undefined,
        verified: user.verified,
      }}
      currentInterests={myInterests}
    />
  );

  if (!topUser) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <Text style={styles.emptyText}>Пока анкет нет — загружаем…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {justMatched && (
        <View style={styles.matchOverlay}>
          <Text style={styles.matchText}>Match!</Text>
        </View>
      )}
      {nextUser && (
        <Animated.View style={[styles.absolute, nextStyle]}>
          <Card user={nextUser} />
        </Animated.View>
      )}
      <GestureDetector gesture={Gesture.Simultaneous(pan, doubleTap)}>
        <Animated.View style={[styles.absolute, topStyle]}>
          <Animated.Text
            style={[
              styles.badge,
              {
                left: 16,
                opacity: interpolate(
                  translateX.value,
                  [-SWIPE_X, -SWIPE_X / 2, 0],
                  [1, 0.6, 0],
                  Extrapolate.CLAMP,
                ),
                transform: [{ rotate: "-15deg" }],
                backgroundColor: "#ff4d4f",
              },
            ]}
          >
            NOPE
          </Animated.Text>
          <Animated.Text
            style={[
              styles.badge,
              {
                right: 16,
                opacity: interpolate(
                  translateX.value,
                  [0, SWIPE_X / 2, SWIPE_X],
                  [0, 0.6, 1],
                  Extrapolate.CLAMP,
                ),
                transform: [{ rotate: "15deg" }],
                backgroundColor: "#22c55e",
              },
            ]}
          >
            LIKE
          </Animated.Text>
          <Animated.Text
            style={[
              styles.badge,
              {
                alignSelf: "center",
                opacity: 0.9,
                backgroundColor: "#0ea5e9",
              },
            ]}
          >
            SUPER
          </Animated.Text>
          <Card user={topUser} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors?.bg ?? "#fafafa",
  },
  emptyState: { alignItems: "center", justifyContent: "center" },
  emptyText: { color: theme.colors?.text ?? "#222", fontSize: 18 },
  absolute: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 32,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors?.card ?? "#fff",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  photoFallback: {
    backgroundColor: theme.colors?.primary ?? "#8A2BE2",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontSize: 40, fontWeight: "800", color: "#fff" },
  meta: {
    padding: 16,
    marginTop: "auto",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#111" },
  bio: { marginTop: 6, fontSize: 14, color: "#333" },
  matchOverlay: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  matchText: {
    backgroundColor: "#ff477e",
    color: "#fff",
    fontWeight: "800",
    fontSize: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: 24,
    zIndex: 10,
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
