import { initializeApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
} from "firebase/firestore";
import {
  getReactNativePersistence,
  initializeAuth,
  Auth,
} from "firebase/auth";
import { getStorage, FirebaseStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Конфиг из .env (EXPO_PUBLIC_*)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Простая проверка: настроен ли Firebase
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

// Инициализируем Firebase ТОЛЬКО если конфиг заполнен
if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);

  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });

  db = getFirestore(app);

  storage = getStorage(app);
} else {
  console.warn(
    "[firebaseConfig] Firebase не сконфигурирован — работаем в демо/офлайн-режиме."
  );
}

export { app, auth, db, storage };
