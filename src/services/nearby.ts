import { buildGeoBounds } from './geo';
import { db } from './firebase';
import { query, collection, orderBy, startAt, endAt, getDocs } from 'firebase/firestore';
import { isFirebaseConfigured } from './firebase';

export async function fetchNearbyUsers(lat: number, lng: number, radius = 10000) {
  if (!isFirebaseConfigured()) {
    return mockNearby(lat, lng);
  }
  const bounds = buildGeoBounds(lat, lng, radius);
  const snaps = await Promise.all(bounds.map((b) => {
    const q = query(
      collection(db, 'users'),
      orderBy('geo.geohash'),
      startAt(b[0]),
      endAt(b[1])
    );
    return getDocs(q);
  }));
  const all = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() } as any)));
  // TODO: optional dedupe + real distance filter
  return all;
}

function mockNearby(lat: number, lng: number) {
  const base = [
    { displayName: 'Ana', interests: ['сальса', 'кофе', 'путешествия'], goal: 'dating', mood: 'happy' },
    { displayName: 'Mia', interests: ['спорт', 'кино', 'языки'], goal: 'friends', mood: 'active' },
    { displayName: 'Ivana', interests: ['йога', 'рисование', 'море'], goal: 'long_term', mood: 'chill' },
    { displayName: 'Sara', interests: ['кулинария', 'трекинг', 'музыка'], goal: 'dating', mood: 'party' },
    { displayName: 'Natalia', interests: ['фото', 'книги', 'self-care'], goal: 'chat', mood: 'serious' }
  ];
  return base.map((u, i) => ({
    id: 'mock'+i,
    ...u,
    about: 'Профиль-плейсхолдер для предпросмотра.',
    geo: { lat: lat + (Math.random()-0.5)*0.02, lng: lng + (Math.random()-0.5)*0.02, geohash: 'mock' },
    photos: []
  }));
}
