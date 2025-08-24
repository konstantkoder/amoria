import React from 'react';
import { View, Text, Button } from 'react-native';
import { theme } from '@/theme/theme';

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={{ flex:1, padding:24, justifyContent:'center', backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize:28, fontWeight:'700', marginBottom:12 }}>Добро пожаловать в Amoria</Text>
      <Text style={{ fontSize:16, marginBottom:24 }}>Найдём людей рядом по интересам — без лишних данных.</Text>
      <Button title="Далее" onPress={() => navigation.navigate('Consents')} />
    </View>
  );
}
