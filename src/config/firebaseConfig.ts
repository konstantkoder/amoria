import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
};

console.log("FB PROJECT:", process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

const storage = getStorage(app);

// Простая проверка: настроен ли Firebase
export function isFirebaseConfigured(): boolean {
  // Если projectId не пустой — значит .env заполнен и конфиг есть
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}

export { app, auth, db, storage, isFirebaseConfigured };
