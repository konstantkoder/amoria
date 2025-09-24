// scripts/fix-firebase.mjs
import fs from "fs";
import path from "path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const servicesDir = path.join(srcDir, "services");

// 1) создаём централизованный файл инициализации Firebase
fs.mkdirSync(servicesDir, { recursive: true });
const firebaseFile = path.join(servicesDir, "firebase.ts");
const firebaseContent = `import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN as string,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
`;
fs.writeFileSync(firebaseFile, firebaseContent, "utf8");

// 2) удаляем старый конфиг, если был
const oldCfg = path.join(srcDir, "config", "firebaseConfig.ts");
if (fs.existsSync(oldCfg)) {
  fs.unlinkSync(oldCfg);
}

// 3) заменяем импорты на централизованный
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) fixFile(full);
  }
}
function fixFile(file) {
  let txt = fs.readFileSync(file, "utf8");
  const before = txt;
  // любые относительные пути к config/firebaseConfig -> '~/services/firebase'
  txt = txt.replace(/from\s+['"][^'"]*config[\/\\]firebaseConfig['"]/g, "from '~/services/firebase'");
  if (txt !== before) fs.writeFileSync(file, txt, "utf8");
}
walk(srcDir);

// 4) убеждаемся, что .env игнорируется гитом
const gi = path.join(root, ".gitignore");
if (fs.existsSync(gi)) {
  const gtxt = fs.readFileSync(gi, "utf8");
  if (!/^\s*\.env\s*$/m.test(gtxt)) fs.appendFileSync(gi, "\n.env\n");
}

console.log("✅ Firebase централизован: src/services/firebase.ts создан, импорты обновлены, .env в .gitignore.");
