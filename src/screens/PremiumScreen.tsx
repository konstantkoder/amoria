import React from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { finishTransaction, getAvailablePurchases, type Purchase, useIAP } from "expo-iap";
import { Ionicons } from "@expo/vector-icons";
import ScreenShell from "@/components/ScreenShell";
import FounderBadge from "@/components/FounderBadge";
import { useLocale } from "@/contexts/LocaleContext";
import { useMonetization } from "@/contexts/MonetizationContext";
import * as monetizationApi from "@/services/api/monetizationApi";
import * as growthApi from "@/services/api/growthApi";
import { theme } from "@/theme";
import { reportClientError, sanitizeErrorForReport } from "@/services/api/clientErrorsApi";

const PACKAGE_NAME = "com.kostiantyndemidets.amoria";
const FRAMES: monetizationApi.PremiumFrameStyle[] = ["NONE", "WARM_METALLIC", "BLACK_GLASS", "WARM_HALO"];

export function googlePurchaseProof(purchase: Purchase) {
  const purchaseToken = String(purchase.purchaseToken ?? "").trim();
  const productId = String(purchase.productId ?? "").trim();
  return purchaseToken && productId ? { purchaseToken, productId } : null;
}

export default function PremiumScreen() {
  const { t, locale } = useLocale();
  const { snapshot, loading, refresh } = useMonetization();
  const [busy, setBusy] = React.useState(false);
  const [storeIssue, setStoreIssue] = React.useState("");
  const processed = React.useRef(new Set<string>());
  const busyRef = React.useRef(false);
  const setActionBusy = React.useCallback((value: boolean) => { busyRef.current = value; setBusy(value); }, []);
  const showStoreIssue = React.useCallback((error: unknown, context: string) => {
    setStoreIssue(t("premium.genericError"));
    const safe = sanitizeErrorForReport(error);
    void reportClientError({
      screen: "PremiumScreen",
      action: context,
      code: safe.code,
      message: safe.message,
      stack: safe.stack,
    });
  }, [t]);

  React.useEffect(() => {
    void growthApi.recordEvent("premium_paywall_opened").catch(() => undefined);
  }, []);

  const verifyAndFinish = React.useCallback(async (purchase: Purchase, origin: "purchase" | "restore", releaseBusy = true) => {
    const proof = googlePurchaseProof(purchase);
    if (!proof) {
      if (releaseBusy) setActionBusy(false);
      showStoreIssue(new Error("purchase_proof_missing"), "verify_purchase");
      return;
    }
    if (processed.current.has(proof.purchaseToken)) {
      if (releaseBusy) setActionBusy(false);
      return;
    }
    processed.current.add(proof.purchaseToken);
    try {
      await monetizationApi.verifyGooglePurchase({ ...proof, origin });
      await finishTransaction({ purchase, isConsumable: false });
      await refresh();
      void growthApi.recordEvent("premium_activated", undefined, { outcome: origin }).catch(() => undefined);
      Alert.alert(t("premium.successTitle"), t(origin === "purchase" ? "premium.successBody" : "premium.restoreSuccess"));
    } catch (error) {
      processed.current.delete(proof.purchaseToken);
      showStoreIssue(error, "verify_purchase");
    } finally { if (releaseBusy) setActionBusy(false); }
  }, [refresh, setActionBusy, showStoreIssue, t]);

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => { void verifyAndFinish(purchase, "purchase"); },
    onPurchaseError: (error) => { setActionBusy(false); showStoreIssue(error, "purchase"); },
    onError: (error) => { setActionBusy(false); showStoreIssue(error, "iap"); },
  });
  const product = subscriptions.find((item) => item.id === snapshot?.productId);

  React.useEffect(() => {
    if (!connected || !snapshot?.productId || !snapshot.billingConfigured) return;
    void fetchProducts({ skus: [snapshot.productId], type: "subs" }).catch((error) => showStoreIssue(error, "fetch_products"));
  }, [connected, fetchProducts, showStoreIssue, snapshot?.billingConfigured, snapshot?.productId]);

  const buy = React.useCallback(async () => {
    if (busyRef.current || !snapshot?.productId || !product || Platform.OS !== "android") return;
    setActionBusy(true); setStoreIssue("");
    const offerToken = product.platform === "android"
      ? product.subscriptionOffers.find((offer) => offer.offerTokenAndroid)?.offerTokenAndroid
      : null;
    try {
      void growthApi.recordEvent("premium_purchase_started", undefined, { platform: "android" }).catch(() => undefined);
      await requestPurchase({
        type: "subs",
        request: {
          google: {
            skus: [snapshot.productId],
            ...(offerToken ? { subscriptionOffers: [{ sku: snapshot.productId, offerToken }] } : {}),
          },
          apple: { sku: snapshot.productId },
        },
      });
    } catch (error) { setActionBusy(false); showStoreIssue(error, "request_purchase"); }
  }, [product, requestPurchase, setActionBusy, showStoreIssue, snapshot?.productId]);

  const restore = React.useCallback(async () => {
    if (busyRef.current || !snapshot?.productId || Platform.OS !== "android") return;
    setActionBusy(true); setStoreIssue("");
    try {
      const purchases = await getAvailablePurchases();
      const matches = purchases.filter((item) => item.productId === snapshot.productId);
      if (!matches.length) { setActionBusy(false); Alert.alert(t("premium.restoreTitle"), t("premium.restoreEmpty")); return; }
      for (const purchase of matches) await verifyAndFinish(purchase, "restore", false);
      setActionBusy(false);
    } catch (error) { setActionBusy(false); showStoreIssue(error, "restore"); }
  }, [setActionBusy, showStoreIssue, snapshot?.productId, t, verifyAndFinish]);

  const selectFrame = React.useCallback(async (frameStyle: monetizationApi.PremiumFrameStyle) => {
    if (busyRef.current) return;
    setActionBusy(true);
    try { await monetizationApi.setProfileFrame(frameStyle); await refresh(); }
    catch (error) { showStoreIssue(error, "select_frame"); }
    finally { setActionBusy(false); }
  }, [refresh, setActionBusy, showStoreIssue]);

  const endLabel = snapshot?.entitlement?.endsAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(snapshot.entitlement.endsAt))
    : "";
  const canBuy = Boolean(snapshot?.purchaseAllowed && snapshot.billingConfigured && product && connected && Platform.OS === "android");
  const showStoreActions = snapshot?.mode !== "OFF";

  return (
    <ScreenShell title={t("premium.title")} showBack background="profileArchGardenV6">
      <ScrollView contentContainerStyle={styles.content}>
        {loading && !snapshot ? <ActivityIndicator color={theme.colors.accent} /> : null}
        {snapshot?.founder?.number ? <FounderBadge number={snapshot.founder.number} large /> : null}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{t(`premium.tier.${snapshot?.tier ?? "FREE"}`)}</Text>
          <Text style={styles.title}>{snapshot?.premiumActive ? t("premium.active") : t("premium.unlock")}</Text>
          {endLabel ? <Text style={styles.body}>{t("premium.until", { date: endLabel })}</Text> : null}
          <Text style={styles.body}>{t("premium.features")}</Text>
        </View>
        {snapshot?.mode === "OFF" ? <Text style={styles.notice}>{t("premium.modeOff")}</Text> : null}
        {snapshot?.mode === "TEST" && !snapshot.tester ? <Text style={styles.notice}>{t("premium.modeTest")}</Text> : null}
        {snapshot?.mode === "PAUSED" ? <Text style={styles.notice}>{t("premium.modePaused")}</Text> : null}
        {!snapshot?.billingHealthy && snapshot?.billingConfigured ? <Text style={styles.warning}>{t("premium.billingDegraded")}</Text> : null}
        {showStoreActions ? <><Text style={styles.price}>{product?.displayPrice ?? (snapshot?.billingConfigured ? t("premium.loadingPrice") : t("premium.notConfigured"))}</Text>
        <TouchableOpacity style={[styles.primary, !canBuy || busy ? styles.disabled : null]} disabled={!canBuy || busy} onPress={() => void buy()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t("premium.subscribe")}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondary, busy || !snapshot?.productId || Platform.OS !== "android" ? styles.disabled : null]} disabled={busy || !snapshot?.productId || Platform.OS !== "android"} onPress={() => void restore()}><Text style={styles.secondaryText}>{t("premium.restore")}</Text></TouchableOpacity>
        {snapshot?.productId ? <TouchableOpacity onPress={() => void Linking.openURL(`https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(snapshot.productId!)}&package=${PACKAGE_NAME}`).catch((error) => showStoreIssue(error, "manage_subscription"))}><Text style={styles.link}>{t("premium.manage")}</Text></TouchableOpacity> : null}</> : null}
        {storeIssue ? <TouchableOpacity onPress={() => { setStoreIssue(""); void refresh(); }}><Text style={styles.warning}>{storeIssue}{"\n"}{t("common.retry")}</Text></TouchableOpacity> : null}
        <View style={styles.card}>
          <Text style={styles.title}>{t("premium.frames")}</Text>
          <View style={styles.frameGrid}>{FRAMES.map((frame) => (
            <TouchableOpacity key={frame} disabled={!snapshot?.premiumCapabilitiesAvailable || busy} onPress={() => void selectFrame(frame)} style={[styles.frame, snapshot?.profileFrame.selected === frame ? styles.frameSelected : null]}>
              <Ionicons name={frame === "NONE" ? "remove-circle-outline" : "sparkles-outline"} size={22} color="#F3C98B" />
              <Text style={styles.frameText}>{t(`premium.frame.${frame}`)}</Text>
            </TouchableOpacity>
          ))}</View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 14, paddingBottom: 36 },
  card: { padding: 18, borderRadius: 18, backgroundColor: "rgba(8,13,26,0.66)", borderWidth: 1, borderColor: "rgba(230,185,118,0.25)", gap: 9 },
  eyebrow: { color: "#F3C98B", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: theme.colors.text, fontSize: 21, fontWeight: "900" },
  body: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
  notice: { color: "#F8DDA6", textAlign: "center", lineHeight: 20 },
  warning: { color: "#FFB4A2", textAlign: "center", lineHeight: 19 },
  price: { color: theme.colors.text, textAlign: "center", fontSize: 24, fontWeight: "900" },
  primary: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 14, alignItems: "center", minHeight: 50 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondary: { padding: 13, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: theme.colors.borderSubtle },
  secondaryText: { color: theme.colors.text, fontWeight: "800" },
  link: { color: "#F3C98B", textAlign: "center", textDecorationLine: "underline" },
  disabled: { opacity: 0.45 },
  frameGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  frame: { width: "48%", padding: 12, borderRadius: 12, alignItems: "center", gap: 5, borderWidth: 1, borderColor: "rgba(255,255,255,.14)" },
  frameSelected: { borderColor: "#F3C98B", backgroundColor: "rgba(230,185,118,.12)" },
  frameText: { color: theme.colors.text, fontSize: 12, textAlign: "center" },
});
