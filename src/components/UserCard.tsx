import React from 'react';
import { View, Text, Image } from 'react-native';
import { theme } from '@/theme/theme';

export default function UserCard({ user }: any) {
  return (
    <View style={{ backgroundColor: theme.colors.card, borderRadius: 24, padding: 16, width: '100%', height: '100%' }}>
      <View style={{ flex: 1, borderRadius: 16, backgroundColor: '#f2f2f2', marginBottom: 12, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ opacity:0.5 }}>[Фото]</Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>{user.displayName || 'User'}</Text>
      <Text numberOfLines={2} style={{ marginVertical: 6 }}>{user.about || 'Описание профиля...'}</Text>
      <Text style={{ opacity: 0.8 }}>{(user.interests || []).join(' • ')}</Text>
    </View>
  );
}
