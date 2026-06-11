import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import ScreenBackground, {
  type ScreenBackgroundVariant,
} from "@/components/ScreenBackground";
import { AmoriaTogetherIcon } from "@/components/icons/AmoriaTogetherIcon";
import MenuButton from "@/components/MenuButton";
import { useLocale } from "@/contexts/LocaleContext";
import { openDrawer } from "@/navigation/drawerController";
import {
  type MainTabParamList,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";

type Props = {
  title?: string;
  headerCenter?: React.ReactNode;
  background?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
  showHeader?: boolean;
  showBack?: boolean;
  showMainTabs?: boolean;
  activeMainTab?: keyof MainTabParamList;
  onBack?: () => void;
  children: React.ReactNode;
};

function findTabsNavigator(navigation: any) {
  let current = navigation;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const routeNames = current.getState?.().routeNames;
    if (Array.isArray(routeNames) && routeNames.includes("Tabs")) {
      return current;
    }
    current = current.getParent?.();
  }
  return navigation;
}

function getMainTabFromRouteState(state: any): keyof MainTabParamList | undefined {
  const activeRoute = state?.routes?.[state?.index ?? 0];
  const activeName = activeRoute?.name;
  if (activeName === "Together" || activeName === "Nearby" || activeName === "Inbox") {
    return activeName;
  }
  return undefined;
}

function getLastMainTab(navigation: any): keyof MainTabParamList | undefined {
  const targetNavigation = findTabsNavigator(navigation);
  const state = targetNavigation.getState?.();
  const tabsRoute = state?.routes?.find((route: any) => route?.name === "Tabs");
  return getMainTabFromRouteState(tabsRoute?.state);
}

function MainTabFooter({ activeTab }: { activeTab?: keyof MainTabParamList }) {
  const navigation = useNavigation<any>();
  const { t } = useLocale();
  const inferredActiveTab = activeTab ?? getLastMainTab(navigation);

  const navigateToTab = (screen: keyof MainTabParamList) => {
    const targetNavigation = findTabsNavigator(navigation);
    targetNavigation.navigate("Tabs", { screen });
  };

  const tabs: Array<{
    screen: keyof MainTabParamList;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      screen: "Together",
      label: t("tabs.together"),
      icon: "sparkles-outline",
      activeIcon: "sparkles",
    },
    {
      screen: "Nearby",
      label: t("tabs.nearby"),
      icon: "location-outline",
      activeIcon: "location",
    },
    {
      screen: "Inbox",
      label: t("tabs.chats"),
      icon: "chatbubbles-outline",
      activeIcon: "chatbubbles",
    },
  ];

  return (
    <View style={styles.mainTabs}>
      {tabs.map((tab) => {
        const active = inferredActiveTab === tab.screen;
        return (
          <TouchableOpacity
            key={tab.screen}
            onPress={() => navigateToTab(tab.screen)}
            activeOpacity={0.85}
            style={styles.mainTabItem}
          >
            <View
              style={[
                styles.mainTabIconShell,
                active ? styles.mainTabIconShellActive : styles.mainTabIconShellInactive,
              ]}
            >
              {tab.screen === "Together" ? (
                <AmoriaTogetherIcon active={active} size={active ? 23 : 21} />
              ) : (
                <Ionicons
                  name={active ? tab.activeIcon : tab.icon}
                  size={active ? 23 : 21}
                  color={active ? "#F3C98B" : "#8E94B4"}
                />
              )}
            </View>
            <Text style={[styles.mainTabLabel, active ? styles.mainTabLabelActive : null]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ScreenShell({
  title,
  headerCenter,
  background = "default",
  overlayOpacity,
  blurRadius,
  showHeader = true,
  showBack,
  showMainTabs,
  activeMainTab,
  onBack,
  children,
}: Props) {
  const navigation = useNavigation<RootStackNavigationProp>();

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleMenu = () => {
    openDrawer();
  };

  return (
    <ScreenBackground
      variant={background}
      overlayOpacity={overlayOpacity}
      blurRadius={blurRadius}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {showHeader ? (
          <View style={styles.header}>
            <View style={styles.headerSide}>
              {showBack ? (
                <TouchableOpacity
                  onPress={handleBack}
                  style={styles.iconButton}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.titleWrap}>
              {headerCenter ?? (title ? (
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
              ) : null)}
            </View>

            <View style={styles.headerSide}>
              <MenuButton onPress={handleMenu} />
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      <SafeAreaView style={styles.bodySafe} edges={["left", "right", "bottom"]}>
        <View style={styles.content}>{children}</View>
        {showMainTabs ? <MainTabFooter activeTab={activeMainTab} /> : null}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { paddingHorizontal: 12, paddingTop: 4, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 24,
    backgroundColor: "rgba(7, 11, 21, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerSide: { width: 92, flexDirection: "row", alignItems: "center" },
  titleWrap: { flex: 1, alignItems: "center", paddingHorizontal: 6 },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.48)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 40,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  bodySafe: { flex: 1, paddingHorizontal: 12, paddingTop: 8, backgroundColor: "transparent" },
  content: { flex: 1, backgroundColor: "transparent" },
  mainTabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    minHeight: 64,
    paddingTop: 5,
    paddingBottom: 4,
    marginTop: 8,
    borderRadius: 24,
    backgroundColor: "rgba(7, 11, 21, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  mainTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  mainTabIconShell: {
    minWidth: 48,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mainTabIconShellActive: {
    backgroundColor: "rgba(185, 130, 114, 0.23)",
    borderColor: "rgba(243, 201, 139, 0.48)",
  },
  mainTabIconShellInactive: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  mainTabLabel: {
    color: "#8E94B4",
    fontSize: 11,
    fontWeight: "800",
  },
  mainTabLabelActive: {
    color: "#F3C98B",
  },
});
