import { storage, isFirebaseConfigured } from './firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export async function uploadImage(uid: string, uri: string) {
  if (!isFirebaseConfigured()) {
    // Store local URIs list as mock
    const key = 'photos_'+uid;
    const raw = (await AsyncStorage.getItem(key)) || '[]';
    const arr = JSON.parse(raw);
    arr.push(uri);
    await AsyncStorage.setItem(key, JSON.stringify(arr));
    return uri;
  }
  const resp = await fetch(uri);
  const blob = await resp.blob();
  const id = Date.now()+ '_' + Math.random().toString(36).slice(2,8);
  const r = ref(storage, `users/${uid}/${id}.jpg`);
  await uploadBytes(r, blob);
  const url = await getDownloadURL(r);
  return url;
}

export async function listImages(uid: string) {
  if (!isFirebaseConfigured()) {
    const key = 'photos_'+uid;
    const raw = (await AsyncStorage.getItem(key)) || '[]';
    return JSON.parse(raw);
  }
  // For simplicity, rely on user profile 'photos' array in Firestore.
  // Listing directly from Storage requires listing API; we'll sync via profile.
  return [];
}
