import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import * as growthApi from "@/services/api/growthApi";
import { theme } from "@/theme";

export default function CommunityAvailabilityScreen() {
  const { t } = useLocale(); const [data,setData]=React.useState<growthApi.Availability|null>(null); const [busy,setBusy]=React.useState(true);
  const load=React.useCallback(async()=>{setBusy(true);try{setData(await growthApi.getAvailability());}finally{setBusy(false);}},[]);
  React.useEffect(()=>{void load().catch(()=>undefined);},[load]);
  const update=async(input:{activeToday?:boolean;notifyWhenActivity?:boolean})=>{setBusy(true);try{setData(await growthApi.updateAvailability(input));}finally{setBusy(false);}};
  return <ScreenShell title={t("availability.title")} showBack background="chatCanalV6"><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.body}>{t("availability.body")}</Text>{busy?<ActivityIndicator color={theme.colors.accent}/>:null}
    <View style={styles.card}><Text style={styles.status}>{data?.activeToday?t("availability.active"):t("availability.inactive")}</Text>{data?.activeTodayUntil?<Text style={styles.until}>{new Date(data.activeTodayUntil).toLocaleString()}</Text>:null}</View>
    <TouchableOpacity style={styles.primary} disabled={busy} onPress={()=>void update({activeToday:true})}><Text style={styles.primaryText}>{t("availability.hours",{hours:"12"})}</Text></TouchableOpacity>
    <TouchableOpacity style={styles.secondary} disabled={busy||!data?.activeToday} onPress={()=>void update({activeToday:false})}><Text style={styles.secondaryText}>{t("availability.stop")}</Text></TouchableOpacity>
    <View style={styles.preference}><View style={styles.preferenceText}><Text style={styles.preferenceTitle}>{t("availability.notify")}</Text><Text style={styles.until}>{t("availability.notifyBody")}</Text></View><Switch disabled={busy||!data} value={data?.notifyWhenActivity??false} onValueChange={(value)=>void update({notifyWhenActivity:value})} trackColor={{true:theme.colors.primary}} /></View>
    <Text style={styles.privacy}>{t("availability.privacy")}</Text>
  </ScrollView></ScreenShell>;
}
const styles=StyleSheet.create({content:{padding:20,gap:12},body:{color:theme.colors.text,fontSize:15,lineHeight:22},card:{padding:18,borderRadius:16,backgroundColor:"rgba(8,13,26,.58)",alignItems:"center"},status:{color:"#F3C98B",fontSize:21,fontWeight:"900"},until:{color:theme.colors.subtext,marginTop:5},primary:{padding:14,borderRadius:14,backgroundColor:theme.colors.primary,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900"},secondary:{padding:13,borderRadius:14,borderWidth:1,borderColor:theme.colors.borderSubtle,alignItems:"center"},secondaryText:{color:theme.colors.text,fontWeight:"800"},preference:{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderRadius:14,backgroundColor:"rgba(8,13,26,.58)"},preferenceText:{flex:1},preferenceTitle:{color:theme.colors.text,fontWeight:"800"},privacy:{color:theme.colors.muted,fontSize:12,lineHeight:18}});
