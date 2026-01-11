import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

type Props = {
  onClose?: () => void;
};

export default function AppDrawerContent({ onClose }: Props) {
  const navigation = useNavigation<any>();

  const handleClose = React.useCallback(() => {
    onClose?.();
  }, [onClose]);

  const navigateSafe = React.useCallback(
    (routeName: string) => {
      try {
        navigation.navigate(routeName);
      } catch {
        // ignore navigation errors when route is missing
      } finally {
        onClose?.();
      }
    },
    [navigation, onClose],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Меню</Text>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.85}
          style={styles.button}
        >
          <Ionicons name="close-outline" size={20} color="#E5E7EB" />
          <Text style={styles.buttonText}>Закрыть</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigateSafe("Profile")}
          activeOpacity={0.85}
          style={styles.button}
        >
          <Ionicons name="person-outline" size={20} color="#E5E7EB" />
          <Text style={styles.buttonText}>Профиль</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigateSafe("Tabs")}
          activeOpacity={0.85}
          style={styles.button}
        >
          <Ionicons name="home-outline" size={20} color="#E5E7EB" />
          <Text style={styles.buttonText}>Главная</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    backgroundColor: "transparent",
  },
  title: {
    color: "#E5E7EB",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
  },
  content: {
    gap: 10,
    paddingBottom: 20,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  buttonText: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "700",
  },
});
