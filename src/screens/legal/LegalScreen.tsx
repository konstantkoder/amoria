import React from 'react';
import { View, Text, ScrollView, Button } from 'react-native';
import { PrivacyRU, PrivacyEN, PrivacyHR } from '@/legal/policies';
import { theme } from '@/theme/theme';

export default function LegalScreen({ navigation }: any) {
  return (
    <ScrollView style={{ flex:1, backgroundColor: theme.colors.bg, padding:16 }}>
      <Text style={{ fontSize:24, fontWeight:'700', marginBottom:12 }}>Политика конфиденциальности</Text>
      <Text style={{ marginBottom:12 }}>{PrivacyRU}</Text>
      <Text style={{ marginBottom:12 }}>{PrivacyEN}</Text>
      <Text style={{ marginBottom:12 }}>{PrivacyHR}</Text>
      <Button title="Назад" onPress={() => navigation.goBack()} />
    </ScrollView>
  );
}
