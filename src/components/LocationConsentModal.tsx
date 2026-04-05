import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";

type Props = {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onOpenPrivacy: () => void;
};

export default function LocationConsentModal({
  visible,
  onAccept,
  onDecline,
  onOpenPrivacy,
}: Props) {
  const { t } = useLocale();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} />
        <View style={styles.card}>
          <Text style={styles.title}>{t("privacy.locationConsentTitle")}</Text>
          <Text style={styles.body}>{t("privacy.locationConsentBody")}</Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onOpenPrivacy}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>{t("privacy.viewPolicy")}</Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onDecline}
              style={[styles.actionButton, styles.declineButton]}
            >
              <Text style={styles.declineText}>{t("common.decline")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onAccept}
              style={[styles.actionButton, styles.acceptButton]}
            >
              <Text style={styles.acceptText}>{t("common.accept")}</Text>
            </TouchableOpacity>
          </View>
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
    maxWidth: 380,
    backgroundColor: "#0B1220",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  body: {
    fontSize: 13,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 18,
  },
  linkButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingVertical: 6,
  },
  linkText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  actions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  declineButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  acceptButton: {
    backgroundColor: theme.colors.primary,
    borderColor: "rgba(167,139,250,0.65)",
  },
  declineText: {
    color: "rgba(255,255,255,0.86)",
    fontWeight: "700",
  },
  acceptText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
