import {
  reactExtension,
  useApi,
  Card,
  Spinner,
  Banner,
} from "@shopify/ui-extensions-react/customer-account";

import { SubscriptionSummary } from "./SubscriptionSummary";
import { useSubscriptionStatus } from "./useSubscriptionStatus";

export default reactExtension(
  "customer-account.profile.block.render",
  () => <ProfileBlock />,
);

function ProfileBlock() {
  const { sessionToken } = useApi<"customer-account.profile.block.render">();
  const { data, loading, error } = useSubscriptionStatus(sessionToken);

  return (
    <Card padding>
      {loading ? (
        <Spinner accessibilityLabel="Loading subscription" />
      ) : error || !data ? (
        <Banner status="critical" title="Could not load subscription" />
      ) : (
        <SubscriptionSummary status={data} />
      )}
    </Card>
  );
}
