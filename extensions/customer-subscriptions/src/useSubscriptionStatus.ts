import { useEffect, useState } from "react";

export interface SubscriptionStatus {
  program: {
    id: string;
    name: string;
    shirtQuantity: number;
    intervalMonths: number;
    freeEveryCycles: number;
  };
  enrolled: boolean;
  status: string | null;
  paidCycles: number;
  freeEveryCycles: number;
  cyclesUntilReward: number;
  nextRewardCycle: number | null;
  rewardReady: boolean;
}

// The app backend that serves /api/customer-subscription. Matches
// `application_url` in shopify.app.toml. Override with a dev tunnel URL while
// running `shopify app dev`.
const APP_URL = "https://cycle-subs.aistone.com";

type SessionTokenApi = { get: () => Promise<string> };

interface FetchState {
  data: SubscriptionStatus | null;
  loading: boolean;
  error: boolean;
}

/**
 * Fetches the logged-in customer's reward progress from the app backend,
 * attaching the customer account session token for authentication.
 */
export function useSubscriptionStatus(
  sessionToken: SessionTokenApi,
): FetchState {
  const [state, setState] = useState<FetchState>({
    data: null,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const token = await sessionToken.get();
        const response = await fetch(`${APP_URL}/api/customer-subscription`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as SubscriptionStatus;
        if (active) setState({ data, loading: false, error: false });
      } catch {
        if (active) setState({ data: null, loading: false, error: true });
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [sessionToken]);

  return state;
}
