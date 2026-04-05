import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useRoute } from "@react-navigation/native";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { auth, db } from "@/config/firebaseConfig";
import { theme } from "@/theme";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { sendDmMessage } from "@/services/dm";

type DmMessage = {
  id: string;
  clientId?: string;
  text: string;
  to: string;
  from: string;
  createdAt: number;
  pending?: boolean;
  failed?: boolean;
};

export default function DMChatScreen() {
  const { t } = useLocale();
  const route = useRoute<any>();
  const myId = auth?.currentUser?.uid ?? "me";
  const peerId = route.params?.peerId ?? "demo-peer";
  const peerName = route.params?.peerName ?? t("common.user");
  const threadId = [myId, peerId].sort().join("__");

  const [text, setText] = useState("");
  const textRef = useRef("");
  const inputRef = useRef<TextInput>(null);
  const sendGuardRef = useRef(false);
  const [sending, setSending] = useState(false);

  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [failedById, setFailedById] = useState<Record<string, true>>({});

  useEffect(() => {
    const qy = query(
      collection(db, "dm", threadId, "messages"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: DmMessage[] = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            clientId: String(x.clientId ?? d.id),
            text: String(x.text ?? ""),
            to: String(x.to ?? ""),
            from: String(x.from ?? ""),
            createdAt: Number(x.createdAt ?? 0),
            pending: d.metadata.hasPendingWrites,
          };
        });
        setMsgs(next);
      },
      () => {}
    );

    return unsub;
  }, [threadId]);

  useEffect(() => {
    if (!msgs.length) return;
    setFailedById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of msgs) {
        if (next[m.id] && !m.pending) {
          delete next[m.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [msgs]);

  useEffect(() => {
    setFailedById({});
    textRef.current = "";
    setText("");
  }, [threadId]);

  // AMORIA_DM_RELIABLE_SEND_V1
  const mergedMsgs = useMemo(() => {
    const map = new Map<string, DmMessage>();
    for (const m of msgs) {
      const id = String(m.id);
      map.set(id, {
        ...m,
        failed: Boolean(failedById[id]),
      });
    }
    const deduped = Array.from(map.values());
    deduped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return deduped;
  }, [msgs, failedById]);

  // AMORIA_DM_RELIABLE_SEND_V1
  const send = useCallback(() => {
    const value = (textRef.current || "").trim();
    if (!value) return;
    if (sendGuardRef.current) return;
    sendGuardRef.current = true;

    setSending(true);

    textRef.current = "";
    setText("");
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();
    inputRef.current?.blur?.();
    Keyboard.dismiss();

    const clientId = `m_${myId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setFailedById((prev) => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    void sendDmMessage(db, threadId, myId, peerId, value, clientId)
      .then(() => {
        setFailedById((prev) => {
          if (!prev[clientId]) return prev;
          const next = { ...prev };
          delete next[clientId];
          return next;
        });
      })
      .catch(() => {
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
      })
      .finally(() => {
        setSending(false);
        setTimeout(() => {
          sendGuardRef.current = false;
        }, 250);
      });
  }, [myId, peerId, threadId, t]);

  const retrySend = useCallback(
    (clientId: string) => {
      const target = msgs.find((m) => String(m.id) === clientId);
      if (!target?.text) return;

      setFailedById((prev) => {
        if (!prev[clientId]) return prev;
        const next = { ...prev };
        delete next[clientId];
        return next;
      });

      void sendDmMessage(
        db,
        threadId,
        target.from || myId,
        target.to || peerId,
        target.text,
        clientId
      ).catch(() => {
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
      });
    },
    [msgs, threadId, peerId, myId, t]
  );

  const handleTextChange = useCallback((v: string) => {
    textRef.current = v;
    setText(v);
  }, []);

  const canSend = text.trim().length > 0;

  const renderItem = useCallback(
    ({ item }: { item: DmMessage }) => {
      const failed = item.failed === true;
      const pending = !failed && item.pending === true;
      return (
        <TouchableOpacity
          activeOpacity={failed ? 0.85 : 1}
          disabled={!failed}
          onPress={() => retrySend(item.id)}
          style={[
            styles.msg,
            pending ? styles.msgPending : null,
            failed ? styles.msgFailed : null,
          ]}
        >
          <Text>{item.text}</Text>
          {failed ? (
            <Text style={[styles.msgStatus, styles.msgFailedText]}>
              {t("common.failed")}
            </Text>
          ) : pending ? (
            <Text style={styles.msgStatus}>{t("common.sending")}</Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [retrySend, t]
  );

  return (
    <ScreenShell
      title={t("dm.title", { name: peerName })}
      background="nightCity"
      showBack
    >
      <FlatList
        inverted
        data={mergedMsgs}
        keyExtractor={(item) => String(item.id)}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        renderItem={renderItem}
      />
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={handleTextChange}
            placeholder={t("dm.messagePlaceholder")}
            style={styles.input}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend || sending}
            style={[
              styles.sendBtn,
              !canSend || sending ? styles.sendBtnDisabled : null,
            ]}
          >
            <Text style={styles.sendTxt}>{t("common.send")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  msg: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  msgPending: {
    opacity: 0.65,
  },
  msgFailed: {
    borderColor: "#fca5a5",
    backgroundColor: "#fff5f5",
  },
  msgStatus: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  },
  msgFailedText: {
    color: "#dc2626",
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
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendTxt: { color: "#fff", fontWeight: "800" },
});
