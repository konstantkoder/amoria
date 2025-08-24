import React from 'react';
import { View, Text, Button, Alert } from 'react-native';
import { ensureAuth, deleteUserCompletely } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '@/theme/theme';

export default function ProfileScreen({ navigation }: any) {
  async function deleteAccount() {
    const uid = await ensureAuth();
    await deleteUserCompletely(uid);
    await AsyncStorage.removeItem('onboarded');
    Alert.alert('Удалено', 'Ваш аккаунт удалён.');
    navigation.reset({ index:0, routes:[{ name: 'Onboarding' }] });
  }
  return (
    <View style={{ flex:1, padding:24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize:22, fontWeight:'700', marginBottom:12 }}>Профиль</Text>
      <Button title="Редактировать профиль" onPress={() => navigation.navigate('EditProfile')} />
      <View style={{ height:8 }} />
      <Button title="Мои фото" onPress={() => navigation.navigate('PhotoManager')} />
      <View style={{ height:8 }} />
      <Button title="Политика конфиденциальности" onPress={() => navigation.navigate('Legal')} />
      <View style={{ height:16 }} />
      <Button title="Удалить аккаунт" color="#d11" onPress={deleteAccount} />
    </View>
  );
}
