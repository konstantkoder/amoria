export const MONETIZATION_MODES = ["OFF", "TEST", "ON", "PAUSED"] as const;
export type MonetizationMode = (typeof MONETIZATION_MODES)[number];

export const PREMIUM_FRAME_STYLES = [
  "NONE",
  "WARM_METALLIC",
  "BLACK_GLASS",
  "WARM_HALO",
] as const;
export type PremiumFrameStyle = (typeof PREMIUM_FRAME_STYLES)[number];

export const PREMIUM_FEATURES = [
  "gallery_15",
  "locked_gallery",
  "advanced_nearby_filters",
  "advanced_privacy",
  "extended_together_archive",
  "premium_frames",
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export type EntitlementSource = "founder" | "google_play" | "admin_grant";

export type MonetizationSnapshot = {
  mode: MonetizationMode;
  firstMonetizationEnabledAt: string | null;
  tester: boolean;
  tier: "FREE" | "PREMIUM";
  premiumActive: boolean;
  premiumCapabilitiesAvailable: boolean;
  purchaseAllowed: boolean;
  billingConfigured: boolean;
  billingHealthy: boolean;
  productId: string | null;
  entitlement: {
    source: EntitlementSource;
    startsAt: string;
    endsAt: string;
    status: string;
  } | null;
  founder: {
    status: "reserved" | "activated" | "expired";
    number: number | null;
    reservedAt: string;
    reservationExpiresAt: string;
    activatedAt: string | null;
    premiumStartsAt: string | null;
    premiumEndsAt: string | null;
  } | null;
  profileFrame: {
    selected: PremiumFrameStyle;
    rendered: PremiumFrameStyle;
  };
  limits: {
    galleryPhotos: 6 | 15;
    lockedPhotos: 0 | 10;
  };
};
