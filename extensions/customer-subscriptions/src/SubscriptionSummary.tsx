import {
  Banner,
  BlockStack,
  Divider,
  Heading,
  InlineStack,
  Text,
  View,
} from "@shopify/ui-extensions-react/customer-account";

import type { SubscriptionStatus } from "./useSubscriptionStatus";

export function SubscriptionSummary({
  status,
  detailed,
}: {
  status: SubscriptionStatus;
  detailed?: boolean;
}) {
  if (!status.enrolled) {
    return (
      <Banner status="info" title="No active subscription">
        <Text>
          Subscribe to {status.program.name} to start earning a free shipment
          every {status.program.freeEveryCycles} paid cycles.
        </Text>
      </Banner>
    );
  }

  const remaining = status.cyclesUntilReward;

  return (
    <BlockStack spacing="base">
      <BlockStack spacing="tight">
        <Heading level={detailed ? 2 : 3}>{status.program.name}</Heading>
        <Text appearance="subdued">
          {status.program.shirtQuantity} shirts every{" "}
          {status.program.intervalMonths} month
          {status.program.intervalMonths === 1 ? "" : "s"}
        </Text>
      </BlockStack>

      <Divider />

      <InlineStack spacing="loose">
        <Metric label="Paid cycles" value={String(status.paidCycles)} />
        <Metric
          label="Free every"
          value={`${status.freeEveryCycles} cycles`}
        />
      </InlineStack>

      {status.rewardReady ? (
        <Banner status="success" title="Free shipment unlocked">
          <Text>Your next shipment ships free.</Text>
        </Banner>
      ) : (
        <Banner status="info" title="Reward progress">
          <Text>
            {remaining} more paid cycle{remaining === 1 ? "" : "s"} until your
            next free shipment.
          </Text>
        </Banner>
      )}

      {detailed && status.nextRewardCycle ? (
        <View>
          <Text appearance="subdued">
            Free shipment lands on paid cycle {status.nextRewardCycle}.
          </Text>
        </View>
      ) : null}
    </BlockStack>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack spacing="none">
      <Text size="large" emphasis="bold">
        {value}
      </Text>
      <Text appearance="subdued" size="small">
        {label}
      </Text>
    </BlockStack>
  );
}
