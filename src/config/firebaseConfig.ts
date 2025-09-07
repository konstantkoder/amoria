// src/config/firebaseConfig.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// !!! Здесь — твои реальные ключи (оставь как есть у тебя)
const firebaseConfig = {
  apiKey: "AIzaSyDNkUOnpsJwLWseM7v27-sRqD3pUlPS_C0",
  authDomain: "amoria-951c4.firebaseapp.com",
  projectId: "amoria-951c4",
  storageBucket: "amoria-951c4.firebasestorage.app",
  messagingSenderId: "26536622150",
  appId: "1:26536622150:web:21a451508f005825907247"
};

// Инициализируем один раз
export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Экспорт сервисов
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
