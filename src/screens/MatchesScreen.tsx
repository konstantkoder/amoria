import React, { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { auth } from "@/config/firebaseConfig";
import { listenMyMatches } from "@/services/firebase";

type MatchRow = {
  id: string;
  members: string[];
};

export default function MatchesScreen() {
  const me = auth?.currentUser?.uid;
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<MatchRow[]>([]);

  useEffect(() => {
    if (!me) return;
    const unsub = listenMyMatches(me, (list) => setRows(list));
    return unsub;
  }, [me]);

  return (
    <View style={{ flex: 1, backgroundColor: "#fdeef6", padding: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "800" }}>Совпадения</Text>
      <FlatList
        contentContainerStyle={{ paddingVertical: 12 }}
        data={rows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ marginTop: 12 }}>Пока совпадений нет.</Text>
        }
        renderItem={({ item }) => {
          const other = item.members?.find((u) => u !== me) ?? "Пользователь";
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("Chat", { chatId: item.id })}
              style={{
                backgroundColor: "#fff",
                padding: 14,
                borderRadius: 14,
                marginVertical: 6,
              }}
            >
              <Text style={{ fontWeight: "700" }}>{other}</Text>
              <Text style={{ color: "#666", marginTop: 4 }}>Открыть чат</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
