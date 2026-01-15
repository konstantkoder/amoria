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
  nameKey: string;
  cities: string[];
};

const AD_CATEGORY_META: Record<
  Exclude<AdCategory, "ALL">,
  { labelKey: string; shortKey: string }
> = {
  F4M: { labelKey: "ads.category.F4M.label", shortKey: "ads.category.F4M.short" },
  M4F: { labelKey: "ads.category.M4F.label", shortKey: "ads.category.M4F.short" },
  M4M: { labelKey: "ads.category.M4M.label", shortKey: "ads.category.M4M.short" },
  F4F: { labelKey: "ads.category.F4F.label", shortKey: "ads.category.F4F.short" },
  Other: { labelKey: "ads.category.Other.label", shortKey: "ads.category.Other.short" },
};

export function getAdCategoryMeta(cat: AdCategory) {
  if (cat === "ALL") {
    return {
      labelKey: "ads.category.ALL.label",
      shortKey: "ads.category.ALL.short",
    };
  }
  return (
    AD_CATEGORY_META[cat] ?? {
      labelKey: "ads.category.Other.label",
      shortKey: "ads.category.Other.short",
    }
  );
}

/**
 * Набор стран/городов по умолчанию.
 * Потом можно будет расширить, но логика выбора уже есть.
 */
export const AVAILABLE_COUNTRIES: CountryConfig[] = [
  {
    code: "HR",
    nameKey: "geo.country.HR",
    cities: [
      "geo.city.HR.ZAGREB",
      "geo.city.HR.KARLOVAC",
      "geo.city.HR.SPLIT",
      "geo.city.HR.RIJEKA",
      "geo.city.HR.ZADAR",
    ],
  },
  {
    code: "DE",
    nameKey: "geo.country.DE",
    cities: [
      "geo.city.DE.MUNICH",
      "geo.city.DE.BERLIN",
      "geo.city.DE.HAMBURG",
      "geo.city.DE.COLOGNE",
    ],
  },
  {
    code: "UA",
    nameKey: "geo.country.UA",
    cities: [
      "geo.city.UA.KYIV",
      "geo.city.UA.LVIV",
      "geo.city.UA.ODESA",
      "geo.city.UA.KHARKIV",
    ],
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
