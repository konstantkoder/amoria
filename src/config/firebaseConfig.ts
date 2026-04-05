import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  type Firestore,
  getFirestore,
  initializeFirestore,
} from "firebase/firestore";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY);
}

export const app: FirebaseApp | null = isFirebaseConfigured()
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

// Auth (React Native persistence)
export const auth = (() => {
  if (!app) return null;
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();

export const db: Firestore | null = (() => {
  if (!app) return null;
  try {
    // AMORIA_FIRESTORE_LONGPOLL_V1
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    } as any);
  } catch {
    // If Firestore was already initialized elsewhere, reuse it.
    return getFirestore(app);
  }
})();

export const storage = app ? getStorage(app) : null;
export { firebaseConfig };
