import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: '...',
  appId: '...'
};

export function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== 'YOUR_API_KEY' && firebaseConfig.projectId !== 'YOUR_PROJECT';
}

let app: any;
if (isFirebaseConfigured()) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export const auth = isFirebaseConfigured() ? getAuth(app) : undefined as any;
export const db = isFirebaseConfigured() ? getFirestore(app) : undefined as any;
export const storage = isFirebaseConfigured() ? getStorage(app) : undefined as any;

// Lightweight anon auth helper
export async function ensureAuth(): Promise<string> {
  if (!isFirebaseConfigured()) {
    // fallback pseudo uid
    const uid = 'mock-' + Math.random().toString(36).slice(2, 12);
    return uid;
  }
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return auth.currentUser!.uid;
}

// CRUD stubs
export async function saveUserProfile(uid: string, data: any) {
  if (!isFirebaseConfigured()) {
    console.warn('[Mock saveUserProfile]', uid, data);
    return;
  }
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

export async function deleteUserCompletely(uid: string) {
  if (!isFirebaseConfigured()) {
    console.warn('[Mock deleteUser] ', uid);
    return;
  }
  await deleteDoc(doc(db, 'users', uid));
  // TODO: delete likes/matches/storage via Cloud Functions in prod
}

export async function reportUser(fromUid: string, toUid: string, reason: string) {
  if (!isFirebaseConfigured()) {
    console.warn('[Mock report]', fromUid, toUid, reason);
    return;
  }
  await addDoc(collection(db, 'reports'), { fromUid, toUid, reason, createdAt: Date.now() });
}

export async function blockUser(fromUid: string, toUid: string) {
  if (!isFirebaseConfigured()) {
    console.warn('[Mock block]', fromUid, toUid);
    return;
  }
  await setDoc(doc(db, 'blocks', `${fromUid}_${toUid}`), { fromUid, toUid, createdAt: Date.now() });
}


export async function getUserProfile(uid: string) {
  if (!isFirebaseConfigured()) {
    return {
      uid,
      displayName: 'User',
      birthdate: '1990-01-01',
      interests: ['музыка','спорт'],
      photos: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUserPhotos(uid: string, photos: string[]) {
  if (!isFirebaseConfigured()) {
    console.warn('[Mock updateUserPhotos]', photos.length);
    return;
  }
  await setDoc(doc(db, 'users', uid), { photos, updatedAt: Date.now() }, { merge: true });
}

export async function updateUserFields(uid: string, fields: any) {
  if (!isFirebaseConfigured()) {
    console.warn('[Mock updateUserFields]', fields);
    return;
  }
  await setDoc(doc(db, 'users', uid), { ...fields, updatedAt: Date.now() }, { merge: true });
}
