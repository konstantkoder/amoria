import React, { useEffect } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureAuth, saveUserProfile } from '@/services/firebase';
import { getCurrentPosition, makeGeo } from '@/services/geo';
import { theme } from '@/theme/theme';

export default function FinishScreen({ route, navigation }: any) {
  const data = route.params || {};

  async function persist() {
    const uid = await ensureAuth();
    let geo: any = undefined;
    try {
      const pos = await getCurrentPosition();
      geo = makeGeo(pos.lat, pos.lng);
    } catch (e) {
      // no location, profile without geo
    }
    const profile = {
      uid,
      displayName: data.displayName || 'User',
      birthdate: data.birthdate || '1990-01-01',
      gender: data.gender || 'other',
      interests: String(data.interests || '').split(',').map((s:string)=>s.trim()).filter(Boolean),
      photos: [],
      mood: data.mood,
      goal: data.goal,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      geo
    };
    await saveUserProfile(uid, profile);
    await AsyncStorage.setItem('onboarded', '1');
    Alert.alert('Готово', 'Профиль сохранён.');
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }

  return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor: theme.colors.bg, padding:24 }}>
      <Text style={{ fontSize:22, fontWeight:'700', marginBottom:12 }}>Финальный шаг</Text>
      <Text style={{ textAlign:'center', marginBottom:24 }}>Сохраняем профиль и переходим к людям рядом.</Text>
      <Button title="Завершить" onPress={persist} />
    </View>
  );
}
