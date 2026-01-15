import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { LANGUAGE_LABELS, type Locale } from "@/i18n/translations";

type Props = {
  visible: boolean;
  currentLocale: Locale;
  locales: ReadonlyArray<Locale>;
  onSelect: (code: Locale) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  mandatory?: boolean;
};

export default function LanguagePickerModal({
  visible,
  currentLocale,
  locales,
  onSelect,
  onClose,
  t,
  mandatory = false,
}: Props) {
  const handleBackdropPress = () => {
    if (!mandatory) onClose();
  };

  const handleRequestClose = () => {
    if (!mandatory) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleBackdropPress}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{t("modal.language.title")}</Text>
          <FlatList
            data={locales}
            keyExtractor={(item) => item}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isActive = item === currentLocale;
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => onSelect(item)}
                  style={[
                    styles.languageButton,
                    isActive ? styles.languageButtonActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.languageText,
                      isActive ? styles.languageTextActive : null,
                    ]}
                  >
                    {LANGUAGE_LABELS[item]}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          {!mandatory ? (
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.85}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>{t("common.close")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "80%",
    backgroundColor: "#0B1220",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 14,
    textAlign: "center",
  },
  listContent: {
    gap: 10,
    paddingBottom: 8,
  },
  languageButton: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  languageButtonActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.6)",
  },
  languageText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
  },
  languageTextActive: {
    color: "#FFFFFF",
  },
  closeButton: {
    marginTop: 14,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  closeText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontWeight: "600",
  },
});
