import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as monetizationApi from "@/services/api/monetizationApi";
import * as growthApi from "@/services/api/growthApi";

type ContextValue = {
  snapshot: monetizationApi.MonetizationSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  hasPremiumFeature: boolean;
};

const Context = React.createContext<ContextValue | null>(null);

export function MonetizationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = React.useState<monetizationApi.MonetizationSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const refresh = React.useCallback(async () => {
    if (!user) { setSnapshot(null); return; }
    setLoading(true);
    try { setSnapshot(await monetizationApi.getMonetization()); }
    finally { setLoading(false); }
  }, [user]);

  React.useEffect(() => {
    if (!user) { setSnapshot(null); return; }
    void refresh().catch(() => undefined);
    void growthApi.recordEvent("app_opened").catch(() => undefined);
  }, [refresh, user]);

  const value = React.useMemo(() => ({
    snapshot,
    loading,
    refresh,
    hasPremiumFeature: Boolean(snapshot?.premiumCapabilitiesAvailable),
  }), [loading, refresh, snapshot]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMonetization() {
  const value = React.useContext(Context);
  if (!value) throw new Error("useMonetization must be used inside MonetizationProvider");
  return value;
}
