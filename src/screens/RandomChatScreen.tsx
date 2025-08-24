import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList } from 'react-native';
import { ensureAuth, isFirebaseConfigured, db } from '@/services/firebase';
import { collection, addDoc, onSnapshot, query, where, limit, updateDoc, doc, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '@/theme/theme';

export default function RandomChatScreen(){
  const [roomId, setRoomId] = useState<string>('');
  const [uid, setUid] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    (async () => {
      const id = await ensureAuth(); setUid(id);
      if (isFirebaseConfigured()) {
        const q = query(collection(db, 'randomRooms'), where('users','array-contains','__empty__'), limit(1));
        const res = await getDocs(q);
        if (!res.empty) {
          const room = res.docs[0];
          await updateDoc(doc(db, 'randomRooms', room.id), { users: [room.data().users[0], id] });
          setRoomId(room.id);
        } else {
          const nd = await addDoc(collection(db, 'randomRooms'), { users: ['__empty__', id], createdAt: Date.now() });
          setRoomId(nd.id);
        }
        const mq = query(collection(db, 'randomRooms', roomId || 'tmp', 'messages'));
        const unsub = onSnapshot(mq, snap => {
          setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        });
        return () => unsub();
      } else {
        // mock: local-only message buffer
        const rid = 'mock-room';
        setRoomId(rid);
        const raw = await AsyncStorage.getItem('mock_msgs');
        setMessages(raw ? JSON.parse(raw) : []);
      }
    })();
  }, []);

  async function send(){
    if (!text.trim()) return;
    if (isFirebaseConfigured()) {
      await addDoc(collection(db, 'randomRooms', roomId, 'messages'), { from: uid, text, createdAt: Date.now() });
    } else {
      const msg = { id: String(Date.now()), from: uid, text, createdAt: Date.now() };
      const next = [...messages, msg];
      setMessages(next);
      await AsyncStorage.setItem('mock_msgs', JSON.stringify(next));
    }
    setText('');
  }

  return (
    <View style={{ flex:1, backgroundColor: theme.colors.bg, padding:12 }}>
      <FlatList
        data={messages}
        keyExtractor={(item)=>item.id}
        renderItem={({item}) => (
          <View style={{ alignSelf: item.from === uid ? 'flex-end' : 'flex-start', backgroundColor: '#fff', padding:8, borderRadius:12, marginVertical:4, maxWidth:'80%' }}>
            <Text>{item.text}</Text>
          </View>
        )}
      />
      <View style={{ flexDirection:'row', gap:8 }}>
        <TextInput value={text} onChangeText={setText} placeholder="Сообщение..." style={{ flex:1, backgroundColor:'#fff', padding:12, borderRadius:12 }} />
        <Button title="Отпр." onPress={send} />
      </View>
    </View>
  );
}
