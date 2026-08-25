import { request } from "@/services/api/apiClient";

export type MonetizationMode = "OFF" | "TEST" | "ON" | "PAUSED";
export type PremiumFrameStyle = "NONE" | "WARM_METALLIC" | "BLACK_GLASS" | "WARM_HALO";

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
    source: "founder" | "google_play" | "admin_grant";
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
  profileFrame: { selected: PremiumFrameStyle; rendered: PremiumFrameStyle };
  limits: { galleryPhotos: 6 | 15; lockedPhotos: 0 | 10 };
};

export function getMonetization(): Promise<MonetizationSnapshot> {
  return request("GET", "/me/monetization");
}

export function setProfileFrame(frameStyle: PremiumFrameStyle): Promise<MonetizationSnapshot> {
  return request("PUT", "/me/premium/profile-frame", { frameStyle });
}

export function verifyGooglePurchase(input: {
  purchaseToken: string;
  productId: string;
  origin: "purchase" | "restore";
}): Promise<{ verified: true; premiumActive: boolean; storeStatus: string }> {
  return request("POST", "/billing/google/verify", input);
}
