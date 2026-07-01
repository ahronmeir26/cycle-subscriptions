import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic, webhookId } = await authenticate.webhook(request);

  console.info("privacy_data_request_webhook_received", {
    shop,
    topic,
    webhookId,
  });

  await db.subscriptionEvent.createMany({
    data: [{
      shop,
      dedupeKey: webhookId ? `privacy:${shop}:${webhookId}` : undefined,
      type: "privacy_data_request",
      note: "Customer data request received from Shopify.",
      metadata: JSON.parse(JSON.stringify(payload)),
    }],
    skipDuplicates: true,
  });

  return new Response();
};
