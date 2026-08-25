import React from "react";
import { ActivityIndicator, Share, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import * as growthApi from "@/services/api/growthApi";
import { theme } from "@/theme";

export default function InviteScreen() {
  const { t } = useLocale();
  const [invite, setInvite] = React.useState<growthApi.Invite | null>(null);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => { setLoading(true); try { setInvite(await growthApi.getInvite()); } finally { setLoading(false); } }, []);
  React.useEffect(() => { void load().catch(() => undefined); }, [load]);
  const share = React.useCallback(async () => {
    if (!invite) return;
    const result = await Share.share({ message: `${t("invite.shareText")} ${invite.link}` });
    if (result.action === Share.sharedAction) setInvite(await growthApi.markInviteShared());
  }, [invite, t]);
  return <ScreenShell title={t("invite.title")} showBack background="drawerLanternStreetV6"><ScrollView contentContainerStyle={styles.content}>
    {loading ? <ActivityIndicator color={theme.colors.accent} /> : invite ? <>
      <Text style={styles.body}>{t("invite.body")}</Text>
      <View style={styles.qr}><QRCode value={invite.link} size={210} backgroundColor="#FFFFFF" color="#080D1A" /></View>
      <Text style={styles.code}>{invite.code}</Text><Text selectable style={styles.url}>{invite.link}</Text>
      <TouchableOpacity style={styles.primary} onPress={() => void share()}><Text style={styles.primaryText}>{t("invite.share")}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={() => void Clipboard.setStringAsync(invite.link)}><Text style={styles.secondaryText}>{t("invite.copy")}</Text></TouchableOpacity>
      <View style={styles.stats}><Text style={styles.stat}>{t("invite.shared")}: {invite.shares}</Text><Text style={styles.stat}>{t("invite.activated")}: {invite.activatedInvites}</Text></View>
      <Text style={styles.privacy}>{t("invite.privacy")}</Text>
    </> : <TouchableOpacity onPress={() => void load()}><Text style={styles.body}>{t("common.retry")}</Text></TouchableOpacity>}
  </ScrollView></ScreenShell>;
}
const styles = StyleSheet.create({ content:{padding:20,gap:14,alignItems:"center"},body:{color:theme.colors.text,fontSize:15,lineHeight:22,textAlign:"center"},qr:{padding:14,backgroundColor:"#fff",borderRadius:16},code:{color:"#F3C98B",fontSize:30,fontWeight:"900",letterSpacing:5},url:{color:theme.colors.subtext,textAlign:"center"},primary:{alignSelf:"stretch",padding:14,borderRadius:14,backgroundColor:theme.colors.primary,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900"},secondary:{alignSelf:"stretch",padding:13,borderRadius:14,borderWidth:1,borderColor:theme.colors.borderSubtle,alignItems:"center"},secondaryText:{color:theme.colors.text,fontWeight:"800"},stats:{flexDirection:"row",gap:20},stat:{color:theme.colors.text,fontWeight:"700"},privacy:{color:theme.colors.muted,fontSize:12,lineHeight:18,textAlign:"center"} });
