import React, { useEffect, useState, useRef } from 'react';
import { View, Dimensions, Alert, Button } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { ensureAuth } from '@/services/firebase';
import { askLocationPermission, getCurrentPosition } from '@/services/geo';
import { fetchNearbyUsers } from '@/services/nearby';
import { likeUser } from '@/services/social';
import UserCard from '@/components/UserCard';
import { theme } from '@/theme/theme';

export default function SwipeScreen(){
  const [uid, setUid] = useState<string>('');
  const [users, setUsers] = useState<any[]>([]);
  const swiper = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const id = await ensureAuth(); setUid(id);
      try { await askLocationPermission(); } catch {}
      try {
        const { lat, lng } = await getCurrentPosition();
        const u = await fetchNearbyUsers(lat, lng, 10000);
        setUsers(u);
      } catch {
        const u = await fetchNearbyUsers(45.8150, 15.9819, 10000);
        setUsers(u);
      }
    })();
  }, []);

  async function onSwipedRight(index:number){
    const target = users[index];
    const isMatch = await likeUser(uid, target.id);
    if (isMatch) Alert.alert('Совпадение!', `У вас взаимная симпатия с ${target.displayName}`);
  }

  return (
    <View style={{ flex:1, padding: 12, backgroundColor: theme.colors.bg }}>
      <View style={{ flex:1 }}>
        <Swiper
          ref={swiper}
          cards={users}
          renderCard={(card:any) => card ? <UserCard user={card} /> : null}
          backgroundColor="transparent"
          stackSize={3}
          onSwipedRight={onSwipedRight}
          onSwipedLeft={()=>{}}
          cardHorizontalMargin={12}
          cardVerticalMargin={12}
        />
      </View>
      <View style={{ flexDirection:'row', justifyContent:'space-around', paddingVertical:8 }}>
        <Button title="Нет" onPress={() => swiper.current?.swipeLeft()} />
        <Button title="Да" onPress={() => swiper.current?.swipeRight()} />
      </View>
    </View>
  );
}
