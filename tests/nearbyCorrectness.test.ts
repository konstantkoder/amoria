const { buildProfileCompatibilityHints } = require("../src/services/profileCompatibility.ts") as
  typeof import("../src/services/profileCompatibility");
const { normalizePreferredProfileGenders, normalizeProfileGender } = require(
  "../src/services/profileGender.ts"
) as typeof import("../src/services/profileGender");
const {
  beginNearbyProfileRefresh,
  canShowNearbyIncompleteProfile,
  completeNearbyProfileRefresh,
  failNearbyProfileRefresh,
} = require("../src/services/nearbyProfileLoadState.ts") as
  typeof import("../src/services/nearbyProfileLoadState");
const { mergeAuthUserWithStoredProfile } = require("../src/services/authProfileMerge.ts") as
  typeof import("../src/services/authProfileMerge");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(normalizeProfileGender("male") === "man", "male legacy value maps to man");
assert(normalizeProfileGender("female") === "woman", "female legacy value maps to woman");
assert(normalizeProfileGender("other") === "nonbinary", "Other remains the canonical Other value");
assert(normalizeProfileGender("legacy-unknown") === undefined, "unknown does not map to a binary gender");
assert(
  JSON.stringify(normalizePreferredProfileGenders(["other", "female", "other"])) ===
    JSON.stringify(["nonbinary", "woman"]),
  "preferred gender normalization is deterministic"
);

assert(beginNearbyProfileRefresh("loaded") === "loaded", "complete cached profile remains authoritative while refreshing");
assert(completeNearbyProfileRefresh() === "loaded", "complete backend profile loads after resume");
assert(canShowNearbyIncompleteProfile("loaded"), "genuinely loaded incomplete profile may show its gate");
assert(failNearbyProfileRefresh("loaded") === "loaded", "temporary refresh failure preserves complete state");
assert(!canShowNearbyIncompleteProfile("error"), "cold request failure is recoverable, not incomplete");
let repeatedResumeState = beginNearbyProfileRefresh("loaded");
repeatedResumeState = failNearbyProfileRefresh(repeatedResumeState);
repeatedResumeState = beginNearbyProfileRefresh(repeatedResumeState);
assert(repeatedResumeState === "loaded", "repeated background and token refresh cycles remain stable");
const storedCompleteUser = {
  id: "qa-a",
  email: "qa-a@example.com",
  displayName: "QA A",
  amoriaId: "AMORIA-QA-A",
  avatarUrl: null,
  birthDate: "1995-01-01",
  gender: "woman" as const,
  preferredGenders: [],
  preferredAgeMin: 25,
  preferredAgeMax: 34,
};
const refreshedAuthUser = {
  id: "qa-a",
  email: "qa-a@example.com",
  displayName: "QA A",
  amoriaId: "AMORIA-QA-A",
  avatarUrl: null,
};
const mergedRefreshUser = mergeAuthUserWithStoredProfile(storedCompleteUser, refreshedAuthUser);
assert(mergedRefreshUser.birthDate === "1995-01-01", "token refresh preserves birth date");
assert(mergedRefreshUser.gender === "woman", "token refresh preserves gender");
assert(Array.isArray(mergedRefreshUser.preferredGenders), "token refresh preserves gender preferences");
assert(mergedRefreshUser.preferredAgeMin === 25, "token refresh preserves minimum preferred age");
assert(mergedRefreshUser.preferredAgeMax === 34, "token refresh preserves maximum preferred age");
const switchedUser = mergeAuthUserWithStoredProfile(storedCompleteUser, {
  ...refreshedAuthUser,
  id: "qa-b",
});
assert(switchedUser.birthDate === undefined, "profile data never merges across users");

const supported = buildProfileCompatibilityHints(
  { goal: "friendship", interests: ["Walk"], age: 31, preferredAgeMin: 25, preferredAgeMax: 34 },
  { goal: "friendship", interests: ["walk"], age: 31, preferredAgeMin: 25, preferredAgeMax: 34 }
);
assert(supported.reasons.some((reason) => reason.kind === "goal"), "matching goal has a reason");
assert(supported.reasons.some((reason) => reason.kind === "interest"), "shared interest has a reason");
assert(supported.reasons.some((reason) => reason.kind === "age"), "reciprocal age preference has a reason");

const oneSidedAge = buildProfileCompatibilityHints(
  { age: 31, preferredAgeMin: 25, preferredAgeMax: 34 },
  { age: 31 }
);
assert(oneSidedAge.count === 0, "one-sided age preference does not create a claim");
assert(buildProfileCompatibilityHints({}, {}).count === 0, "empty data has no claim");
assert(
  buildProfileCompatibilityHints({ mood: "chill" }, { mood: "chill" }).count === 0,
  "mood alone does not create an unsupported claim"
);
assert(
  buildProfileCompatibilityHints({ interests: [] }, { interests: [], age: 31 }).count === 0,
  "activity-like unrelated data cannot create a claim"
);
