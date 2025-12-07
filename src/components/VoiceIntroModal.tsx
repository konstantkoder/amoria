import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/theme";

export type VoiceIntroModalProps = {
  visible: boolean;
  onClose: () => void;
  userName?: string;
  durationSeconds?: number;
};

const VoiceIntroModal: React.FC<VoiceIntroModalProps> = ({
  visible,
  onClose,
  userName = "Пользователь",
  durationSeconds = 8,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const anim = useRef(new Animated.Value(0)).current;

  // Небольшой "вайформ" — просто полоски разной высоты
  const bars = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      arr.push(6 + Math.round(Math.random() * 12)); // 6–18 px
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      anim.stopAnimation();
      anim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [anim, isPlaying]);

  // Псевдо-прогресс: просто бежим от 0 до 1 за durationSeconds
  useEffect(() => {
    if (!isPlaying) return;

    const totalMs = durationSeconds * 1000;
    const stepMs = 150;
    let elapsed = 0;

    const id = setInterval(() => {
      elapsed += stepMs;
      const next = Math.min(1, elapsed / totalMs);
      setProgress(next);
      if (next >= 1) {
        clearInterval(id);
        setIsPlaying(false);
      }
    }, stepMs);

    return () => clearInterval(id);
  }, [durationSeconds, isPlaying]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setProgress(0);
    setIsPlaying(true);
  };

  const formattedDuration = useMemo(() => {
    const seconds = Math.max(1, Math.round(durationSeconds));
    if (seconds < 60) return `0:${seconds.toString().padStart(2, "0")}`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [durationSeconds]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Голосовое интро</Text>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.subtext} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Здесь будет настоящий голос{" "}
            <Text style={styles.username}>{userName}</Text> — короткое интро,
            чтобы почувствовать человека по голосу.
          </Text>

          {/* Плеер */}
          <View style={styles.playerRow}>
            <TouchableOpacity
              onPress={handleTogglePlay}
              activeOpacity={0.8}
              style={styles.playButton}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={26}
                color={theme.colors.background}
              />
            </TouchableOpacity>

            <View style={styles.playerRight}>
              {/* Волны */}
              <View style={styles.waveRow}>
                {bars.map((h, index) => {
                  const scaleY = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange:
                      index % 2 === 0 ? [0.8, 1.3] : [1.3, 0.8],
                  });
                  return (
                    <Animated.View
                      // eslint-disable-next-line react/no-array-index-key
                      key={index}
                      style={[
                        styles.waveBar,
                        {
                          height: h,
                          transform: [{ scaleY }],
                        },
                      ]}
                    />
                  );
                })}
              </View>

              {/* Прогресс-бар */}
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(progress * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressTime}>{formattedDuration}</Text>
              </View>
            </View>
          </View>

          {/* Подсказки для интро */}
          <View style={styles.hintsBlock}>
            <Text style={styles.hintsTitle}>Идеи для интро:</Text>
            <Text style={styles.hintItem}>• 3 слова, которые тебя описывают.</Text>
            <Text style={styles.hintItem}>
              • Что тебе больше всего нравится в людях?
            </Text>
            <Text style={styles.hintItem}>
              • Чем бы занялся/занялась, если бы завтра был выходной без забот?
            </Text>
          </View>

          <Text style={styles.demoNote}>
            Сейчас это демо-режим. Позже здесь появится настоящая запись, которую
            можно будет отправить прямо из профиля или чата.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: theme.colors.card,
    padding: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.subtext,
    marginBottom: 16,
  },
  username: {
    color: theme.colors.accent,
    fontWeight: "700",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  playerRight: {
    flex: 1,
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 26,
    marginBottom: 8,
  },
  waveBar: {
    width: 4,
    borderRadius: 999,
    marginHorizontal: 2,
    backgroundColor: "rgba(248, 250, 252, 0.9)",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.35)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
  },
  progressTime: {
    marginLeft: 8,
    fontSize: 11,
    color: theme.colors.subtext,
  },
  hintsBlock: {
    marginTop: 4,
    marginBottom: 8,
  },
  hintsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  hintItem: {
    fontSize: 12,
    color: theme.colors.subtext,
    marginBottom: 2,
  },
  demoNote: {
    fontSize: 11,
    color: theme.colors.muted,
    marginTop: 4,
  },
});

export default VoiceIntroModal;

