// Безопасная заглушка для Firebase.
// Ключи берём из .env (см. .env.example). Без них проект не упадёт, но Firebase не подключится.

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY ?? "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.FIREBASE_APP_ID ?? "",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID ?? "",
};

if (!firebaseConfig.apiKey) {
  console.warn(
    "[firebase] Empty config. Add keys to .env (see .env.example) or fill firebaseConfig.ts"
  );
}

export default firebaseConfig;

