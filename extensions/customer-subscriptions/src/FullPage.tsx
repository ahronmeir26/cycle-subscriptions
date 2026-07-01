import {
  reactExtension,
  useApi,
  Page,
  Card,
  Spinner,
  Banner,
} from "@shopify/ui-extensions-react/customer-account";

import { SubscriptionSummary } from "./SubscriptionSummary";
import { useSubscriptionStatus } from "./useSubscriptionStatus";

export default reactExtension("customer-account.page.render", () => (
  <FullPage />
));

function FullPage() {
  const { sessionToken } = useApi<"customer-account.page.render">();
  const { data, loading, error } = useSubscriptionStatus(sessionToken);

  return (
    <Page title="My subscription">
      <Card padding>
        {loading ? (
          <Spinner accessibilityLabel="Loading subscription" />
        ) : error || !data ? (
          <Banner status="critical" title="Could not load subscription">
            Please try again later.
          </Banner>
        ) : (
          <SubscriptionSummary status={data} detailed />
        )}
      </Card>
    </Page>
  );
}
