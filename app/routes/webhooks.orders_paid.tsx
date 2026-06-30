import type { ActionFunctionArgs } from "react-router";

import { recordOrderCycle } from "../models/subscriptions.server";
import { authenticate } from "../shopify.server";

type OrderPaidPayload = {
  id?: number;
  admin_graphql_api_id?: string;
  email?: string;
  contact_email?: string;
  customer?: {
    id?: number;
    admin_graphql_api_id?: string;
    email?: string;
  };
  line_items?: Array<{
    selling_plan_name?: string | null;
    selling_plan_id?: number | null;
  }>;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const order = payload as OrderPaidPayload;
  const subscriptionLine = order.line_items?.find(
    (lineItem) => lineItem.selling_plan_id || lineItem.selling_plan_name,
  );

  console.log(`Received ${topic} webhook for ${shop}`);

  if (!subscriptionLine) {
    return new Response();
  }

  await recordOrderCycle({
    shop,
    orderId: order.admin_graphql_api_id ?? (order.id ? String(order.id) : null),
    customerId:
      order.customer?.admin_graphql_api_id ??
      (order.customer?.id ? String(order.customer.id) : null),
    customerEmail:
      order.customer?.email ?? order.email ?? order.contact_email ?? null,
    contractId: subscriptionLine.selling_plan_id
      ? String(subscriptionLine.selling_plan_id)
      : subscriptionLine.selling_plan_name,
    note: `Recorded from ${topic}.`,
  });

  return new Response();
};
