import db from "../db.server";
import { recordOrderCycle } from "../models/subscriptions.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, payload, shop, topic, webhookId } =
    await authenticate.webhook(request);
  const order = payload;
  const fallbackLine = order.line_items?.find(
    (lineItem) => lineItem.selling_plan_id || lineItem.selling_plan_name,
  );
  const enrichedOrder =
    order.admin_graphql_api_id && admin
      ? await getEnrichedOrder(
          (query, options) => admin.graphql(query, options),
          order.admin_graphql_api_id,
        )
      : null;
  const subscriptionLine = enrichedOrder?.subscriptionLine ?? fallbackLine;

  console.info("orders_paid_webhook_received", {
    shop,
    topic,
    webhookId,
    orderId: order.admin_graphql_api_id ?? order.id,
  });

  if (!subscriptionLine) {
    return new Response();
  }

  const programId = await findProgramIdForLine(shop, subscriptionLine);
  const contractId = isEnrichedLine(subscriptionLine)
    ? subscriptionLine.contractId
    : null;
  const sellingPlanId = sellingPlanIdForLine(subscriptionLine);
  const sellingPlanName = isEnrichedLine(subscriptionLine)
    ? subscriptionLine.sellingPlanName
    : subscriptionLine.selling_plan_name;

  await recordOrderCycle({
    shop,
    programId,
    orderId: order.admin_graphql_api_id ?? (order.id ? String(order.id) : null),
    customerId:
      enrichedOrder?.customerId ??
      order.customer?.admin_graphql_api_id ??
      (order.customer?.id ? String(order.customer.id) : null),
    customerEmail:
      enrichedOrder?.customerEmail ??
      order.customer?.email ??
      order.email ??
      order.contact_email ??
      null,
    contractId,
    sourceEventId: webhookId,
    metadata: {
      sellingPlanId,
      sellingPlanName,
      matchedProgramId: programId,
    },
    note: `Recorded from ${topic}.`,
  });

  return new Response();
};

async function getEnrichedOrder(graphql, orderId) {
  try {
    const response = await graphql(
      `
        #graphql
        query PaidSubscriptionOrder($id: ID!) {
          order(id: $id) {
            customer {
              id
              email
            }
            lineItems(first: 100) {
              nodes {
                contract {
                  id
                }
                product {
                  id
                }
                sellingPlan {
                  name
                  sellingPlanId
                }
              }
            }
          }
        }
      `,
      { variables: { id: orderId } },
    );
    const json = await response.json();
    const order = json.data?.order;
    const subscriptionLine = order?.lineItems?.nodes.find(
      (line) => line.contract || line.sellingPlan,
    );

    return {
      customerId: order?.customer?.id ?? null,
      customerEmail: order?.customer?.email ?? null,
      subscriptionLine: subscriptionLine
        ? {
            contractId: subscriptionLine.contract?.id ?? null,
            productId: subscriptionLine.product?.id ?? null,
            sellingPlanId: subscriptionLine.sellingPlan?.sellingPlanId ?? null,
            sellingPlanName: subscriptionLine.sellingPlan?.name ?? null,
          }
        : null,
    };
  } catch (error) {
    console.error("orders_paid_enrichment_failed", {
      orderId,
      message: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

async function findProgramIdForLine(shop, line) {
  const sellingPlanId = sellingPlanIdForLine(line);
  const productId = productIdForLine(line);
  const programs = await db.subscriptionProgram.findMany({
    where: { shop },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (sellingPlanId) {
    const bySellingPlan = programs.find(
      (program) =>
        program.sellingPlanId === sellingPlanId ||
        program.sellingPlanId?.endsWith(`/${sellingPlanId}`),
    );

    if (bySellingPlan) return bySellingPlan.id;
  }

  if (productId) {
    const byProduct = programs.find((program) =>
      program.productGids
        .split(",")
        .map((id) => id.trim())
        .includes(productId),
    );

    if (byProduct) return byProduct.id;
  }

  return programs[0]?.id ?? null;
}

function isEnrichedLine(line) {
  return "contractId" in line || "sellingPlanId" in line || "productId" in line;
}

function sellingPlanIdForLine(line) {
  if (isEnrichedLine(line)) return line.sellingPlanId ?? null;

  return line.selling_plan_id ? String(line.selling_plan_id) : null;
}

function productIdForLine(line) {
  if (isEnrichedLine(line)) return line.productId ?? null;

  return line.product_id ? `gid://shopify/Product/${line.product_id}` : null;
}
