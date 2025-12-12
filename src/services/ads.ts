// FILE: src/services/ads.ts
import {
  Firestore,
  QueryConstraint,
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";

export type AdCategory = "F4M" | "M4F" | "M4M" | "F4F" | "Other" | "ALL";

export type PersonalAd = {
  id: string;
  authorUid: string;
  title: string;
  text: string;
  category: Exclude<AdCategory, "ALL">;
  countryCode: string;
  countryName: string;
  city: string;
  createdAt: number;
  isActive: boolean;
};

export type CreatePersonalAdInput = {
  authorUid: string;
  title: string;
  text: string;
  category: Exclude<AdCategory, "ALL">;
  countryCode: string;
  countryName: string;
  city: string;
};

export type AdFilters = {
  category: AdCategory;
  countryCode?: string;
  city?: string;
};

export type CountryConfig = {
  code: string;
  name: string;
  cities: string[];
};

const AD_CATEGORY_META: Record<
  Exclude<AdCategory, "ALL">,
  { label: string; short: string }
> = {
  F4M: { label: "Она ищет его", short: "Она • Он" },
  M4F: { label: "Он ищет её", short: "Он • Она" },
  M4M: { label: "Он ищет его", short: "Он • Он" },
  F4F: { label: "Она ищет её", short: "Она • Она" },
  Other: { label: "Что-то другое", short: "Другое" },
};

export function getAdCategoryMeta(cat: AdCategory) {
  if (cat === "ALL") {
    return { label: "Все категории", short: "Все" };
  }
  return AD_CATEGORY_META[cat] ?? { label: "Другое", short: "Другое" };
}

/**
 * Набор стран/городов по умолчанию.
 * Потом можно будет расширить, но логика выбора уже есть.
 */
export const AVAILABLE_COUNTRIES: CountryConfig[] = [
  {
    code: "HR",
    name: "Хорватия",
    cities: ["Загреб", "Карловац", "Сплит", "Риека", "Задар"],
  },
  {
    code: "DE",
    name: "Германия",
    cities: ["Мюнхен", "Берлин", "Гамбург", "Кёльн"],
  },
  {
    code: "UA",
    name: "Украина",
    cities: ["Киев", "Львов", "Одесса", "Харьков"],
  },
];

export function getDefaultCountry(): CountryConfig {
  return AVAILABLE_COUNTRIES[0];
}

export function findCountry(code?: string): CountryConfig | undefined {
  if (!code) return undefined;
  return AVAILABLE_COUNTRIES.find((c) => c.code === code);
}

export function subscribePersonalAds(
  db: Firestore,
  filters: AdFilters,
  onAds: (ads: PersonalAd[]) => void
) {
  const baseRef = collection(db, "personalAds");

  const constraints: QueryConstraint[] = [
    where("isActive", "==", true),
    orderBy("createdAt", "desc"),
    limit(80),
  ];

  if (filters.category && filters.category !== "ALL") {
    constraints.unshift(where("category", "==", filters.category));
  }
  if (filters.countryCode) {
    constraints.unshift(where("countryCode", "==", filters.countryCode));
  }
  if (filters.city) {
    constraints.unshift(where("city", "==", filters.city));
  }

  const q = query(baseRef, ...constraints);

  return onSnapshot(q, (snap) => {
    const list: PersonalAd[] = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        authorUid: String(x.authorUid ?? ""),
        title: String(x.title ?? ""),
        text: String(x.text ?? ""),
        category: (x.category as any) ?? "Other",
        countryCode: String(x.countryCode ?? ""),
        countryName: String(x.countryName ?? ""),
        city: String(x.city ?? ""),
        createdAt: Number(x.createdAt ?? 0),
        isActive: Boolean(x.isActive ?? true),
      };
    });
    onAds(list);
  });
}

export async function createPersonalAd(
  db: Firestore,
  input: CreatePersonalAdInput
) {
  const now = Date.now();
  await addDoc(collection(db, "personalAds"), {
    authorUid: input.authorUid,
    title: input.title.trim(),
    text: input.text.trim(),
    category: input.category,
    countryCode: input.countryCode,
    countryName: input.countryName,
    city: input.city,
    createdAt: now,
    isActive: true,
  });
}
