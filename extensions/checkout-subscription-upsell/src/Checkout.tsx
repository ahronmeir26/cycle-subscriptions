import {
  reactExtension,
  useCartLines,
  useSettings,
  Banner,
  BlockStack,
  Text,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.checkout.block.render", () => (
  <SubscriptionUpsell />
));

function SubscriptionUpsell() {
  const cartLines = useCartLines();
  const { reward_text, upsell_text } = useSettings<{
    reward_text?: string;
    upsell_text?: string;
  }>();

  const hasSubscription = cartLines.some((line) =>
    Boolean(line.sellingPlanAllocation),
  );

  if (hasSubscription) {
    const message =
      reward_text ?? "You're on track for a free shipment milestone.";
    return (
      <Banner status="success" title="Subscription perk">
        <BlockStack spacing="none">
          <Text>{message}</Text>
        </BlockStack>
      </Banner>
    );
  }

  const upsell = upsell_text?.trim();
  if (!upsell) return null;

  return (
    <Banner status="info" title="Subscribe & save">
      <BlockStack spacing="none">
        <Text>{upsell}</Text>
      </BlockStack>
    </Banner>
  );
}
