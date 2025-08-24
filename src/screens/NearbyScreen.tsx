import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, Button, Alert, TouchableOpacity } from 'react-native';
import { askLocationPermission, getCurrentPosition } from '@/services/geo';
import { fetchNearbyUsers } from '@/services/nearby';
import { ensureAuth, reportUser, blockUser } from '@/services/firebase';
import { theme } from '@/theme/theme';

const radiusOptions = [2000, 5000, 10000];

function Tag({ label, active, onPress }: any){
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, marginRight:8, backgroundColor: active ? theme.colors.primary : '#eee' }}>
      <Text style={{ color: active ? '#fff' : '#333' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function NearbyScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [uid, setUid] = useState<string>('');
  const [radius, setRadius] = useState(10000);
  const [goal, setGoal] = useState<string|undefined>();
  const [mood, setMood] = useState<string|undefined>();

  async function load(lat:number, lng:number){
    const data = await fetchNearbyUsers(lat, lng, radius);
    const filtered = data.filter((u:any) => (!goal || u.goal===goal) && (!mood || u.mood===mood));
    setUsers(filtered);
  }

  useEffect(() => {
    (async () => {
      const id = await ensureAuth();
      setUid(id);
      try { await askLocationPermission(); } catch {}
      try {
        const { lat, lng } = await getCurrentPosition();
        await load(lat, lng);
      } catch {
        await load(45.8150, 15.9819);
      }
    })();
  }, [radius, goal, mood]);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontWeight:'700', marginBottom:8 }}>Радиус</Text>
      <View style={{ flexDirection:'row', marginBottom:8 }}>
        {radiusOptions.map(r => <Tag key={r} label={r/1000+' км'} active={radius===r} onPress={()=>setRadius(r)} />)}
      </View>
      <Text style={{ fontWeight:'700' }}>Цель</Text>
      <View style={{ flexDirection:'row', marginBottom:8, marginTop:4 }}>
        {['dating','friends','chat','long_term','short_term'].map(g => <Tag key={g} label={g} active={goal===g} onPress={()=>setGoal(goal===g?undefined:g)} />)}
      </View>
      <Text style={{ fontWeight:'700' }}>Настроение</Text>
      <View style={{ flexDirection:'row', marginBottom:12, marginTop:4 }}>
        {['happy','chill','active','serious','party'].map(m => <Tag key={m} label={m} active={mood===m} onPress={()=>setMood(mood===m?undefined:m)} />)}
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderRadius: 16, backgroundColor: theme.colors.card, marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', fontSize: 18 }}>{item.displayName}</Text>
            <Text style={{ marginVertical:6 }} numberOfLines={2}>{item.about}</Text>
            <Text style={{ opacity:0.7 }}>{(item.interests || []).join(' • ')}</Text>
            <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
              <Button title="Пожаловаться" onPress={async () => { await reportUser(uid, item.id, 'inappropriate'); Alert.alert('Спасибо', 'Жалоба отправлена'); }} />
              <Button title="Заблокировать" onPress={async () => { await blockUser(uid, item.id); Alert.alert('Готово', 'Пользователь заблокирован'); }} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
