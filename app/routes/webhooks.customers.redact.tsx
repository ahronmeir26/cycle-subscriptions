import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

type CustomerRedactPayload = {
  customer?: {
    id?: number | string | null;
    email?: string | null;
  };
  customer_id?: number | string | null;
  email?: string | null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic, webhookId } = await authenticate.webhook(request);
  const body = payload as CustomerRedactPayload;
  const customerId = body.customer?.id ?? body.customer_id ?? null;
  const email = body.customer?.email ?? body.email ?? null;
  const ids = customerId
    ? [
        String(customerId),
        `gid://shopify/Customer/${customerId}`,
      ]
    : [];

  console.info("customer_redact_webhook_received", {
    shop,
    topic,
    webhookId,
    customerId,
  });

  const accountFilters = [
    ...(ids.length > 0 ? [{ customerId: { in: ids } }] : []),
    ...(email ? [{ customerEmail: email }] : []),
  ];
  const operations = [];

  if (accountFilters.length > 0) {
    operations.push(
      db.subscriptionAccount.updateMany({
        where: {
          shop,
          OR: accountFilters,
        },
        data: {
          identityKey: customerId ? `redacted:${customerId}` : "redacted",
          customerId: null,
          customerEmail: null,
          contractId: null,
          status: "redacted",
        },
      }),
    );
  }

  operations.push(
    db.subscriptionEvent.createMany({
      data: [{
        shop,
        dedupeKey: webhookId ? `privacy:${shop}:${webhookId}` : undefined,
        type: "customer_redacted",
        note: "Customer personal data redacted after Shopify request.",
        metadata: JSON.parse(JSON.stringify(payload)),
      }],
      skipDuplicates: true,
    }),
  );

  await db.$transaction(operations);

  return new Response();
};
