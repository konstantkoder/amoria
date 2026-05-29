import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Keyboard, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Drawer } from "react-native-drawer-layout";

import PlayLobbyScreen from "@/screens/PlayLobbyScreen";
import NearbyHubScreen from "@/screens/NearbyHubScreen";
import AnnouncementsScreen from "@/screens/AnnouncementsScreen";
import InboxScreen from "@/screens/InboxScreen";
import PlayMatchScreen from "@/screens/PlayMatchScreen";
import PlayCanvasScreen from "@/screens/PlayCanvasScreen";
import PlayStorySparksScreen from "@/screens/PlayStorySparksScreen";
import PlayResultScreen from "@/screens/PlayResultScreen";
import PlayHistoryScreen from "@/screens/PlayHistoryScreen";
import PlaySessionDetailScreen from "@/screens/PlaySessionDetailScreen";
import DMChatScreen from "@/screens/DMChatScreen";
import UserProfileScreen from "@/screens/UserProfileScreen";
import CreateAnnouncementScreen from "@/screens/CreateAnnouncementScreen";
import AnnouncementDetailScreen from "@/screens/AnnouncementDetailScreen";

import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import PrivacyPolicyScreen from "@/screens/PrivacyPolicyScreen";
import LocationInfoScreen from "@/screens/LocationInfoScreen";

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

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

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
    void getUserProfile()
      .then((profile) => {
        if (!alive) return;
        const displayName = profile.displayName ?? "";
        setNameDraft(displayName);
        setRequiresName(Boolean(getDisplayNameValidationErrorKey(displayName)));
      })
      .catch(() => {
        if (!alive) return;
        setRequiresName(true);
        setErrorText(t("profile.nameUpdateFailed"));
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
    const nextName = normalizeDisplayNameInput(nameDraft);
    const errorKey = getDisplayNameValidationErrorKey(nextName);
    if (errorKey) {
      setErrorText(t(errorKey));
      return;
    }

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
      setSaving(false);
    }
  }, [nameDraft, t]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!requiresName) {
    return <>{children}</>;
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          borderRadius: theme.shapes.card,
          padding: 18,
          backgroundColor: "rgba(10, 14, 26, 0.94)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
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
    if (!uid) {
      setThreads([]);
      wsClient.disconnect();
      return () => {
        alive = false;
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

    void loadInboxBadge();
    wsClient.connect();
    wsClient.subscribeInbox();
    const unsubscribe = wsClient.onMessage((message) => {
      if (!alive || message.type !== "inbox.updated") return;
      void loadInboxBadge();
    });

    return () => {
      alive = false;
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
  const announcementsTabLabel = React.useMemo(() => {
    const announcements = t("tabs.announcements");
    return announcements === "tabs.announcements" ? "Announcements" : announcements;
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
          Together: { active: "sparkles", inactive: "sparkles-outline" },
          Announcements: { active: "document-text", inactive: "document-text-outline" },
          Inbox: { active: "chatbubbles", inactive: "chatbubbles-outline" },
        };

        return {
          headerShown: false,
          lazy: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: theme.colors.text,
          tabBarInactiveTintColor: theme.colors.tabInactive,
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: "rgba(255,255,255,0.08)",
            height: 60 + insets.bottom,
            paddingBottom: 5 + insets.bottom,
            paddingTop: 4,
          },
          tabBarItemStyle: isTogetherTab
            ? {
                marginTop: -3,
                paddingHorizontal: 1,
              }
            : {
                marginTop: 1,
                paddingHorizontal: 1,
              },
          tabBarLabelStyle: {
            fontSize: isTogetherTab ? 11 : 10,
            fontWeight: isTogetherTab ? "800" : "600",
            marginTop: 0,
          },
          tabBarIcon: ({ color, size, focused }) => {
            const icon = icons[route.name];
            const name = focused ? icon?.active ?? "ellipse" : icon?.inactive ?? "ellipse-outline";

            if (isTogetherTab) {
              return (
                <View
                  style={{
                    minWidth: 44,
                    minHeight: focused ? 40 : 38,
                    borderRadius: 999,
                    backgroundColor: focused
                      ? "rgba(255, 78, 138, 0.18)"
                      : "rgba(255,255,255,0.04)",
                    borderWidth: 1,
                    borderColor: focused
                      ? "rgba(255, 122, 60, 0.28)"
                      : "rgba(255,255,255,0.08)",
                    shadowColor: focused ? theme.colors.primary : "transparent",
                    shadowOpacity: focused ? 0.18 : 0,
                    shadowRadius: focused ? 10 : 0,
                    shadowOffset: { width: 0, height: 5 },
                    elevation: focused ? 7 : 0,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={name}
                    size={focused ? size + 3 : size + 1}
                    color={color}
                  />
                </View>
              );
            }

            return <Ionicons name={name} size={focused ? size + 1 : size} color={color} />;
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
        name="Announcements"
        component={AnnouncementsScreen}
        options={{
          title: announcementsTabLabel,
          tabBarLabel: announcementsTabLabel,
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
                  color: "#fff",
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
      overlayStyle={{ backgroundColor: "rgba(2, 5, 14, 0.44)" }}
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
        <RootStack.Screen name="CreateAnnouncement" component={CreateAnnouncementScreen} />
        <RootStack.Screen name="AnnouncementDetail" component={AnnouncementDetailScreen} />
        <RootStack.Screen name="PlayMatch" component={PlayMatchScreen} />
        <RootStack.Screen name="PlayCanvas" component={PlayCanvasScreen} />
        <RootStack.Screen name="PlayStorySparks" component={PlayStorySparksScreen} />
        <RootStack.Screen name="PlayResult" component={PlayResultScreen} />
        <RootStack.Screen name="PlayHistory" component={PlayHistoryScreen} />
        <RootStack.Screen name="PlaySessionDetail" component={PlaySessionDetailScreen} />
        <RootStack.Screen name="DMChat" component={DMChatScreen} />
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
