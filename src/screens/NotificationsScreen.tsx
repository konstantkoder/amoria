import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import * as notificationsApi from "@/services/api/notificationsApi";
import { requestAndRegisterPush } from "@/services/notifications";
import { theme } from "@/theme";
import { resolvePushRoute } from "@/services/pushRouting";

export default function NotificationsScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"Notifications">>();
  const { t, locale } = useLocale();
  const [items, setItems] = React.useState<notificationsApi.NotificationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [pushState, setPushState] = React.useState<"idle" | "working" | "registered" | "denied" | "device_required">("idle");
  const pushBusyRef = React.useRef(false);

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const response = await notificationsApi.listNotifications();
      setItems(response.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(React.useCallback(() => {
    void load();
  }, [load]));

  const open = React.useCallback(async (item: notificationsApi.NotificationDto) => {
    setItems((current) => current.map((candidate) => candidate.id === item.id && !candidate.readAt
      ? { ...candidate, readAt: new Date().toISOString() }
      : candidate));
    await notificationsApi.markNotificationRead(item.id).catch(() => undefined);
    const route = await resolvePushRoute({ type: item.type, ...item.payload });
    if (route) navigation.navigate(route.name as any, route.params as any);
  }, [navigation]);

  const enablePush = React.useCallback(async () => {
    if (pushBusyRef.current) return;
    pushBusyRef.current = true;
    setPushState("working");
    try {
      setPushState(await requestAndRegisterPush());
    } catch {
      setPushState("idle");
      setError(true);
    } finally {
      pushBusyRef.current = false;
    }
  }, []);

  return (
    <ScreenShell title={t("notifications.title")} background="profileArchGardenV6" showBack>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.intro}>{t("notifications.intro")}</Text>
        <TouchableOpacity style={styles.pushButton} disabled={pushState === "working"} onPress={() => void enablePush()}>
          <Text style={styles.pushButtonText}>{pushState === "working" ? t("common.loading") : t("notifications.enablePush")}</Text>
        </TouchableOpacity>
        {pushState === "registered" ? <Text style={styles.status}>{t("notifications.pushEnabled")}</Text> : null}
        {pushState === "denied" ? <Text style={styles.status}>{t("notifications.pushDenied")}</Text> : null}
        {pushState === "device_required" ? <Text style={styles.status}>{t("notifications.deviceRequired")}</Text> : null}

        {loading ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}
        {!loading && error ? (
          <TouchableOpacity onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>{t("notifications.loadFailed")}</Text>
          </TouchableOpacity>
        ) : null}
        {!loading && !error && items.length === 0 ? <Text style={styles.empty}>{t("notifications.empty")}</Text> : null}
        {items.map((item) => (
          <TouchableOpacity key={item.id} onPress={() => void open(item)} style={[styles.item, !item.readAt ? styles.unread : null]}>
            <View style={styles.itemTop}>
              <Text style={styles.itemTitle}>{t(item.titleKey)}</Text>
              {!item.readAt ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.itemBody}>{t(`notifications.body.${item.type}`)}</Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString(locale)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 6, paddingTop: 8, paddingBottom: 32, gap: 10 },
  intro: { color: "rgba(229,231,235,0.76)", fontSize: 13, lineHeight: 19 },
  pushButton: { alignSelf: "flex-start", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.buttons.primary.backgroundColor, borderWidth: 1, borderColor: theme.buttons.primary.borderColor },
  pushButtonText: { color: theme.buttons.primary.textColor, fontWeight: "800" },
  status: { color: "rgba(229,231,235,0.72)", fontSize: 12 },
  loader: { marginTop: 24 },
  retryButton: { paddingVertical: 20 },
  retryText: { color: "#FFD7DF", fontSize: 14, textAlign: "center" },
  empty: { color: "rgba(229,231,235,0.72)", fontSize: 14, textAlign: "center", paddingVertical: 28 },
  item: { borderRadius: 16, padding: 14, backgroundColor: "rgba(5,8,22,0.58)", borderWidth: 1, borderColor: "rgba(230,185,118,0.14)", gap: 5 },
  unread: { borderColor: "rgba(230,185,118,0.46)", backgroundColor: "rgba(27,23,35,0.76)" },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { flex: 1, color: "#F4E8D1", fontSize: 15, fontWeight: "800" },
  itemBody: { color: "rgba(229,231,235,0.78)", fontSize: 13, lineHeight: 18 },
  date: { color: "rgba(229,231,235,0.52)", fontSize: 11 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
});
