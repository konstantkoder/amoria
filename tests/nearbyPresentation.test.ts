const {
  buildNearbyPersonAccessibilityLabel,
  buildNearbyPersonMetadata,
  formatNearbyDistanceAccessibility,
  formatNearbyDistanceBucket,
  getNearbyPeopleGridLayout,
} = require("../src/services/nearbyPresentation.ts") as
  typeof import("../src/services/nearbyPresentation");
const { translate } = require("../src/i18n/translations.ts") as
  typeof import("../src/i18n/translations");

function assertEqual(actual: string, expected: string, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const ru = (key: string, params?: Record<string, string>) => translate("ru", key, params);
const en = (key: string, params?: Record<string, string>) => translate("en", key, params);
const hr = (key: string, params?: Record<string, string>) => translate("hr", key, params);

const distanceCases = [
  {
    locale: "RU",
    t: ru,
    labels: ["до 1 км", "до 5 км", "до 25 км", "до 100 км", "100+ км"],
  },
  {
    locale: "EN",
    t: en,
    labels: ["up to 1 km", "up to 5 km", "up to 25 km", "up to 100 km", "100+ km"],
  },
  {
    locale: "HR",
    t: hr,
    labels: ["do 1 km", "do 5 km", "do 25 km", "do 100 km", "100+ km"],
  },
] as const;
const buckets = ["under_1km", "1_5km", "5_25km", "25_100km", "over_100km"] as const;
for (const testCase of distanceCases) {
  buckets.forEach((bucket, index) => {
    assertEqual(
      formatNearbyDistanceBucket(bucket, testCase.t),
      testCase.labels[index],
      `${testCase.locale} ${bucket}`
    );
  });
}

assertEqual(buildNearbyPersonMetadata("31", "до 25 км"), "31 · до 25 км", "age and distance");
assertEqual(buildNearbyPersonMetadata("31", ""), "31", "age only");
assertEqual(buildNearbyPersonMetadata("", "до 25 км"), "до 25 км", "distance only");
assertEqual(buildNearbyPersonMetadata("", ""), "", "no malformed separator");

assertEqual(
  buildNearbyPersonAccessibilityLabel(
    "Катя",
    "31",
    formatNearbyDistanceAccessibility("5_25km", ru)
  ),
  "Катя, 31, до 25 километров",
  "privacy-safe accessibility label"
);

const responsiveCases = [
  { width: 360, columns: 2, avatarSize: 108 },
  { width: 390, columns: 3, avatarSize: 104 },
  { width: 430, columns: 3, avatarSize: 104 },
  { width: 431, columns: 3, avatarSize: 116 },
];
for (const expected of responsiveCases) {
  const layout = getNearbyPeopleGridLayout(expected.width);
  if (layout.columns !== expected.columns || layout.avatarSize !== expected.avatarSize) {
    throw new Error(
      `responsive layout ${expected.width}: expected ${expected.columns} columns / ${expected.avatarSize}px avatar, got ${layout.columns} / ${layout.avatarSize}`
    );
  }
  if (layout.rowGap !== 14) {
    throw new Error(`responsive layout ${expected.width}: row gap changed`);
  }
}
