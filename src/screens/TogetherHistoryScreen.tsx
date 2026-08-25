import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { useMonetization } from "@/contexts/MonetizationContext";
import type { RootStackNavigationProp } from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import type { TogetherHistoryItemDto } from "@/services/api/types";
import { theme } from "@/theme";

export default function TogetherHistoryScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"TogetherHistory">>();
  const { t, locale } = useLocale();
  const { hasPremiumFeature } = useMonetization();
  const [items, setItems] = React.useState<TogetherHistoryItemDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const loadBusyRef = React.useRef(false);
  const load = React.useCallback(async () => {
    if (loadBusyRef.current) return;
    loadBusyRef.current = true;
    setLoading(true); setFailed(false);
    try { setItems((await togetherApi.getHistory(50)).items); }
    catch { setFailed(true); }
    finally { loadBusyRef.current = false; setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  return <ScreenShell title={t("togetherHistory.title")} showBack background="togetherObservatoryV6">
    <ScrollView contentContainerStyle={styles.content}>
      {!hasPremiumFeature ? <Pressable style={styles.premiumCard} onPress={() => navigation.navigate("Premium")}>
        <Text style={styles.premiumTitle}>{t("togetherHistory.freeLimit")}</Text>
        <Text style={styles.body}>{t("togetherHistory.unlock")}</Text>
      </Pressable> : <Text style={styles.body}>{t("togetherHistory.extended")}</Text>}
      {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {failed ? <Pressable onPress={() => void load()}><Text style={styles.retry}>{t("common.retry")}</Text></Pressable> : null}
      {!loading && !failed && !items.length ? <Text style={styles.body}>{t("togetherHistory.empty")}</Text> : null}
      {items.map((item) => <Pressable key={item.sessionId} style={styles.card} onPress={() => navigation.navigate("PlayResult", { sessionId: item.sessionId })}>
        <View style={styles.row}><Text style={styles.title}>{item.peer.displayName}</Text><Text style={styles.date}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</Text></View>
        <Text style={styles.body}>{item.activity === "story_sparks" ? t("togetherHistory.story") : t("togetherHistory.draw")}</Text>
        <Text style={styles.open}>{t("togetherHistory.view")}</Text>
      </Pressable>)}
    </ScrollView>
  </ScreenShell>;
}

const styles = StyleSheet.create({
  content:{padding:20,gap:12}, premiumCard:{padding:17,borderRadius:16,borderWidth:1,borderColor:"rgba(230,185,118,.42)",backgroundColor:"rgba(8,13,26,.72)"}, premiumTitle:{color:"#F3C98B",fontSize:17,fontWeight:"900",marginBottom:5}, body:{color:theme.colors.subtext,fontSize:14,lineHeight:20}, retry:{color:"#F3C98B",fontWeight:"800",textAlign:"center",padding:14}, card:{padding:17,borderRadius:16,backgroundColor:"rgba(8,13,26,.68)",borderWidth:1,borderColor:theme.colors.borderSubtle}, row:{flexDirection:"row",justifyContent:"space-between",gap:12}, title:{color:theme.colors.text,fontSize:16,fontWeight:"900",flex:1}, date:{color:theme.colors.muted,fontSize:12}, open:{color:"#F3C98B",fontWeight:"800",marginTop:10}
});
