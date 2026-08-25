import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { reportClientError, sanitizeErrorForReport } from "@/services/api/clientErrorsApi";
import * as growthApi from "@/services/api/growthApi";
import { theme } from "@/theme";

export default function CommunityAvailabilityScreen() {
  const { t, locale } = useLocale(); const [data,setData]=React.useState<growthApi.Availability|null>(null); const [busy,setBusy]=React.useState(true); const [errorKey,setErrorKey]=React.useState(""); const busyRef=React.useRef(false);
  const load=React.useCallback(async()=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setErrorKey("");try{setData(await growthApi.getAvailability());}catch(error){const safe=sanitizeErrorForReport(error);void reportClientError({screen:"CommunityAvailability",action:"load",code:safe.code,message:safe.message,stack:safe.stack});setErrorKey("availability.loadFailed");}finally{busyRef.current=false;setBusy(false);}},[]);
  React.useEffect(()=>{void load();},[load]);
  const update=async(input:{activeToday?:boolean;notifyWhenActivity?:boolean})=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setErrorKey("");try{setData(await growthApi.updateAvailability(input));}catch(error){const safe=sanitizeErrorForReport(error);void reportClientError({screen:"CommunityAvailability",action:"update",code:safe.code,message:safe.message,stack:safe.stack});setErrorKey("availability.updateFailed");}finally{busyRef.current=false;setBusy(false);}};
  return <ScreenShell title={t("availability.title")} showBack background="chatCanalV6"><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.body}>{t("availability.body")}</Text>{busy?<ActivityIndicator color={theme.colors.accent}/>:null}
    {errorKey?<TouchableOpacity onPress={()=>void load()} accessibilityRole="button"><Text style={styles.warning}>{t(errorKey)}</Text></TouchableOpacity>:null}
    {data?<><View style={styles.card}><Text style={styles.status}>{data.activeToday?t("availability.active"):t("availability.inactive")}</Text>{data.activeTodayUntil?<Text style={styles.until}>{t("availability.until", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.activeTodayUntil)) })}</Text>:null}</View>
    <TouchableOpacity style={styles.primary} disabled={busy} onPress={()=>void update({activeToday:true})}><Text style={styles.primaryText}>{t("availability.hours",{hours:new Intl.NumberFormat(locale).format(12)})}</Text></TouchableOpacity>
    <TouchableOpacity style={styles.secondary} disabled={busy||!data.activeToday} onPress={()=>void update({activeToday:false})}><Text style={styles.secondaryText}>{t("availability.stop")}</Text></TouchableOpacity>
    <View style={styles.preference}><View style={styles.preferenceText}><Text style={styles.preferenceTitle}>{t("availability.notify")}</Text><Text style={styles.until}>{t("availability.notifyBody")}</Text></View><Switch disabled={busy} value={data.notifyWhenActivity} onValueChange={(value)=>void update({notifyWhenActivity:value})} trackColor={{true:theme.colors.primary}} /></View></>:null}
    <Text style={styles.privacy}>{t("availability.privacy")}</Text>
  </ScrollView></ScreenShell>;
}
const styles=StyleSheet.create({content:{padding:20,gap:12},body:{color:theme.colors.text,fontSize:15,lineHeight:22},warning:{color:"#FFB4A2",textAlign:"center",lineHeight:20},card:{padding:18,borderRadius:16,backgroundColor:"rgba(8,13,26,.58)",alignItems:"center"},status:{color:"#F3C98B",fontSize:21,fontWeight:"900",textAlign:"center"},until:{color:theme.colors.subtext,marginTop:5},primary:{padding:14,borderRadius:14,backgroundColor:theme.colors.primary,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900",textAlign:"center"},secondary:{padding:13,borderRadius:14,borderWidth:1,borderColor:theme.colors.borderSubtle,alignItems:"center"},secondaryText:{color:theme.colors.text,fontWeight:"800",textAlign:"center"},preference:{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderRadius:14,backgroundColor:"rgba(8,13,26,.58)"},preferenceText:{flex:1},preferenceTitle:{color:theme.colors.text,fontWeight:"800"},privacy:{color:theme.colors.muted,fontSize:12,lineHeight:18}});
