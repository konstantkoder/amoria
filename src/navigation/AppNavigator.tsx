import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  InteractionManager,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Drawer } from "react-native-drawer-layout";

import PlayLobbyScreen from "@/screens/PlayLobbyScreen";
import NearbyHubScreen from "@/screens/NearbyHubScreen";
import InboxScreen from "@/screens/InboxScreen";
import PlayMatchScreen from "@/screens/PlayMatchScreen";
import PlayCanvasScreen from "@/screens/PlayCanvasScreen";
import PlayStorySparksScreen from "@/screens/PlayStorySparksScreen";
import PlayResultScreen from "@/screens/PlayResultScreen";
import DMChatScreen from "@/screens/DMChatScreen";
import NearbyRoomChatScreen from "@/screens/NearbyRoomChatScreen";
import NearbyActivityPreferencesScreen from "@/screens/NearbyActivityPreferencesScreen";
import UserProfileScreen from "@/screens/UserProfileScreen";
import CreateAnnouncementScreen from "@/screens/CreateAnnouncementScreen";
import AnnouncementDetailScreen from "@/screens/AnnouncementDetailScreen";

import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import PrivacyPolicyScreen from "@/screens/PrivacyPolicyScreen";
import LocationInfoScreen from "@/screens/LocationInfoScreen";

import { AmoriaTogetherIcon } from "@/components/icons/AmoriaTogetherIcon";
import ScreenBackground from "@/components/ScreenBackground";
import { theme } from "@/theme";
import AppDrawerContent from "@/navigation/AppDrawerContent";
import {
  type MainTabParamList,
  type ProfileStackParamList,
  type RootStackParamList,
} from "@/navigation/appRoutes";
import { registerDrawerControls } from "@/navigation/drawerController";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth } from "@/contexts/AuthContext";
import * as chatApi from "@/services/api/chatApi";
import type { ThreadDto } from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import {
  getDisplayNameValidationErrorKey,
  getUserProfile,
  normalizeDisplayNameInput,
  updateUserDisplayName,
} from "@/services/user";
import { startStartupSpan } from "@/services/startupDiagnostics";

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const TAB_ACTIVE_TINT = "#F3C98B";
const TAB_INACTIVE_TINT = "#8E9484";

function BottomTabIconShell({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.tabIconShell,
        focused ? styles.tabIconShellActive : styles.tabIconShellInactive,
      ]}
    >
      {children}
    </View>
  );
}

function TogetherTabIcon({
  focused,
  size,
  color,
}: {
  focused: boolean;
  size: number;
  color: string;
}) {
  return (
    <BottomTabIconShell focused={focused}>
      <AmoriaTogetherIcon
        active={focused}
        size={focused ? 27 : 25}
        color={color}
      />
    </BottomTabIconShell>
  );
}

function IdentitySetupGate({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [requiresName, setRequiresName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [errorText, setErrorText] = React.useState("");
  const nameInputRef = React.useRef<TextInput>(null);
  const saveNameInFlightRef = React.useRef(false);

  React.useEffect(() => {
    let alive = true;
    if (!uid) {
      setLoading(false);
      setRequiresName(false);
      setNameDraft("");
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    setErrorText("");
    const finishProfileBootstrap = startStartupSpan("profile.bootstrap");
    void getUserProfile()
      .then((profile) => {
        if (!alive) return;
        const displayName = profile.displayName ?? "";
        setNameDraft(displayName);
        setRequiresName(Boolean(getDisplayNameValidationErrorKey(displayName)));
        finishProfileBootstrap({
          outcome: "success",
          requiresName: Boolean(getDisplayNameValidationErrorKey(displayName)),
        });
      })
      .catch(() => {
        if (!alive) return;
        setRequiresName(true);
        setErrorText(t("profile.nameUpdateFailed"));
        finishProfileBootstrap({ outcome: "error" });
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [t, uid]);

  const saveName = React.useCallback(async () => {
    if (saveNameInFlightRef.current) return;
    const nextName = normalizeDisplayNameInput(nameDraft);
    const errorKey = getDisplayNameValidationErrorKey(nextName);
    if (errorKey) {
      setErrorText(t(errorKey));
      return;
    }

    saveNameInFlightRef.current = true;
    setSaving(true);
    setErrorText("");
    try {
      await updateUserDisplayName(nextName);
      setNameDraft(nextName);
      setRequiresName(false);
      nameInputRef.current?.blur();
      Keyboard.dismiss();
    } catch {
      setErrorText(t("profile.nameUpdateFailed"));
    } finally {
      saveNameInFlightRef.current = false;
      setSaving(false);
    }
  }, [nameDraft, t]);

  if (loading) {
    return (
      <ScreenBackground variant="startLighthouseV6">
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </ScreenBackground>
    );
  }

  if (!requiresName) {
    return <>{children}</>;
  }

  return (
    <ScreenBackground variant="startLighthouseV6">
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            padding: 18,
            backgroundColor: "transparent",
            borderWidth: 0,
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "800" }}>
            {t("profile.completeProfile")}
          </Text>
          <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: "900" }}>
            {t("profile.yourName")}
          </Text>
          <Text style={{ color: theme.colors.subtext, fontSize: 14, lineHeight: 20 }}>
            {t("profile.completeProfileBody")}
          </Text>
          <TextInput
            ref={nameInputRef}
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder={t("profile.enterName")}
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="words"
            editable={!saving}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => void saveName()}
            style={{
              borderRadius: theme.radius,
              borderWidth: 1,
              borderColor: theme.colors.borderSubtle,
              backgroundColor: theme.colors.card,
              color: theme.colors.text,
              paddingHorizontal: 14,
              paddingVertical: 11,
            }}
          />
          {errorText ? (
            <Text style={{ color: theme.colors.danger, fontSize: 13, fontWeight: "700" }}>
              {errorText}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => void saveName()}
            disabled={saving}
            activeOpacity={0.85}
            style={{
              borderRadius: theme.radius,
              paddingVertical: 13,
              alignItems: "center",
              backgroundColor: theme.colors.primary,
              opacity: saving ? 0.65 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }}>
              {saving ? t("common.saving") : t("profile.saveName")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenBackground>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="PhotoManager" component={PhotoManagerScreen} />
    </ProfileStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [threads, setThreads] = React.useState<ThreadDto[]>([]);

  React.useEffect(() => {
    let alive = true;
    let deferredStartupWork: { cancel?: () => void } | null = null;
    if (!uid) {
      setThreads([]);
      wsClient.disconnect();
      return () => {
        alive = false;
        deferredStartupWork?.cancel?.();
      };
    }

    async function loadInboxBadge() {
      try {
        const response = await chatApi.listInbox(30);
        if (!alive) return;
        setThreads(response.items ?? []);
      } catch {
        if (!alive) return;
        setThreads([]);
      }
    }

    deferredStartupWork = InteractionManager.runAfterInteractions(() => {
      if (!alive) return;
      void loadInboxBadge();
      wsClient.connect();
      wsClient.subscribeInbox();
    });
    const unsubscribe = wsClient.onMessage((message) => {
      if (!alive || message.type !== "inbox.updated") return;
      void loadInboxBadge();
    });

    return () => {
      alive = false;
      deferredStartupWork?.cancel?.();
      unsubscribe();
    };
  }, [uid]);

  const freshChatsCount = React.useMemo(
    () => threads.reduce((total, thread) => total + Math.max(thread.unreadCount ?? 0, 0), 0),
    [threads]
  );
  const nearbyTabLabel = React.useMemo(() => {
    const nearby = t("tabs.nearby");
    return nearby === "tabs.nearby" ? "Nearby" : nearby;
  }, [t]);

  return (
    <Tab.Navigator
      initialRouteName="Together"
      detachInactiveScreens={false}
      sceneContainerStyle={{ backgroundColor: theme.colors.background }}
      screenOptions={({ route }) => {
        const isTogetherTab = route.name === "Together";
        const icons: Record<
          string,
          {
            active: keyof typeof Ionicons.glyphMap;
            inactive: keyof typeof Ionicons.glyphMap;
          }
        > = {
          Nearby: { active: "location", inactive: "location-outline" },
          Inbox: { active: "chatbubbles", inactive: "chatbubbles-outline" },
        };

        return {
          headerShown: false,
          lazy: true,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: TAB_ACTIVE_TINT,
          tabBarInactiveTintColor: TAB_INACTIVE_TINT,
          tabBarStyle: {
            backgroundColor: "rgba(5,8,22,0.96)",
            borderTopColor: "rgba(230,185,118,0.16)",
            height: 68 + insets.bottom,
            paddingBottom: 5 + insets.bottom,
            paddingTop: 6,
          },
          tabBarItemStyle: {
            marginTop: -3,
            paddingHorizontal: 1,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            lineHeight: 14,
            fontWeight: "600",
            marginTop: 0,
          },
          tabBarIcon: ({ color, size, focused }) => {
            if (isTogetherTab) {
              return (
                <TogetherTabIcon focused={focused} size={size} color={color} />
              );
            }

            const icon = icons[route.name];
            const name = focused ? icon?.active ?? "ellipse" : icon?.inactive ?? "ellipse-outline";

            return (
              <BottomTabIconShell focused={focused}>
                <Ionicons name={name} size={focused ? size + 1 : size} color={color} />
              </BottomTabIconShell>
            );
          },
        };
      }}
    >
      <Tab.Screen
        name="Together"
        component={PlayLobbyScreen}
        options={{
          title: t("tabs.together"),
          tabBarLabel: t("tabs.together"),
        }}
      />
      <Tab.Screen
        name="Nearby"
        component={NearbyHubScreen}
        options={{
          title: nearbyTabLabel,
          tabBarLabel: nearbyTabLabel,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: t("tabs.chats"),
          tabBarLabel: t("tabs.chats"),
          ...(freshChatsCount
            ? {
                tabBarBadge: freshChatsCount > 9 ? "9+" : freshChatsCount,
                tabBarBadgeStyle: {
                  backgroundColor: theme.colors.primary,
                  color: theme.colors.primaryActionText,
                  fontSize: 11,
                  fontWeight: "800",
                },
              }
            : {}),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    registerDrawerControls({
      setOpen: setDrawerOpen,
      getOpen: () => drawerOpen,
    });
  }, [drawerOpen]);

  return (
    <IdentitySetupGate>
    <Drawer
      open={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={() => setDrawerOpen(false)}
      drawerType="front"
      swipeEnabled
      overlayStyle={{ backgroundColor: "rgba(8, 13, 26, 0.24)" }}
      drawerStyle={{ backgroundColor: "transparent", width: 300 }}
      style={{ backgroundColor: "transparent" }}
      renderDrawerContent={() => (
        <AppDrawerContent onClose={() => setDrawerOpen(false)} />
      )}
    >
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <RootStack.Screen name="Tabs" component={MainTabs} />
        {/* Deprecated legacy announcement routes kept for old links and DM context only. */}
        <RootStack.Screen name="CreateAnnouncement" component={CreateAnnouncementScreen} />
        <RootStack.Screen name="AnnouncementDetail" component={AnnouncementDetailScreen} />
        <RootStack.Screen name="PlayMatch" component={PlayMatchScreen} />
        <RootStack.Screen name="PlayCanvas" component={PlayCanvasScreen} />
        <RootStack.Screen name="PlayStorySparks" component={PlayStorySparksScreen} />
        <RootStack.Screen name="PlayResult" component={PlayResultScreen} />
        <RootStack.Screen name="DMChat" component={DMChatScreen} />
        <RootStack.Screen name="NearbyRoomChat" component={NearbyRoomChatScreen} />
        <RootStack.Screen
          name="NearbyActivityPreferences"
          component={NearbyActivityPreferencesScreen}
        />
        <RootStack.Screen name="UserProfile" component={UserProfileScreen} />
        <RootStack.Screen name="Profile" component={ProfileStackNavigator} />
        <RootStack.Screen name="Settings" component={SettingsScreen} />
        <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <RootStack.Screen name="LocationInfo" component={LocationInfoScreen} />
      </RootStack.Navigator>
    </Drawer>
    </IdentitySetupGate>
  );
}

const styles = StyleSheet.create({
  tabIconShell: {
    width: 46,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconShellActive: {
    backgroundColor: "rgba(230,185,118,0.08)",
    borderColor: "rgba(230,185,118,0.18)",
    shadowColor: "#E6B976",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  tabIconShellInactive: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
});
