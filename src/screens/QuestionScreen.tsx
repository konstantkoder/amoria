import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QUESTIONS, getDailyQuestionId } from '@/services/questions';
import { isFirebaseConfigured, db, ensureAuth } from '@/services/firebase';
import { setDoc, doc } from 'firebase/firestore';
import { theme } from '@/theme/theme';

export default function QuestionScreen(){
  const [qid, setQid] = useState<string>('');
  const [text, setText] = useState('');

  useEffect(() => {
    const id = getDailyQuestionId(new Date());
    setQid(id);
  }, []);

  const q = QUESTIONS.find(q=>q.id===qid);

  async function save(){
    const uid = await ensureAuth();
    if (isFirebaseConfigured()) {
      await setDoc(doc(db, 'answers', `${uid}_${qid}`), { uid, questionId: qid, answer: text, updatedAt: Date.now() }, { merge:true });
    } else {
      await AsyncStorage.setItem(`answer_${qid}`, text);
    }
    Alert.alert('Сохранено', 'Ответ записан');
  }

  if (!q) return null;

  return (
    <View style={{ flex:1, padding:24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize:22, fontWeight:'700', marginBottom:12 }}>Вопрос дня</Text>
      <Text style={{ fontSize:18, marginBottom:12 }}>{q.text}</Text>
      <TextInput value={text} onChangeText={setText} placeholder="Ваш ответ..." multiline numberOfLines={4} style={{ backgroundColor:'#fff', padding:12, borderRadius:12, height:120, marginBottom:12 }} />
      <Button title="Сохранить" onPress={save} />
    </View>
  );
}
