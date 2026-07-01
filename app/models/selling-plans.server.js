import db from "../db.server";

export function productIdsForProgram(program) {
  return program.productGids
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function sellingPlanInputForProgram(program, sellingPlanId) {
  return {
    ...(sellingPlanId ? { id: sellingPlanId } : {}),
    name: `${program.shirtQuantity} shirts every ${program.intervalMonths} months`,
    options: [`Every ${program.intervalMonths} months`],
    category: "SUBSCRIPTION",
    billingPolicy: {
      recurring: {
        interval: "MONTH",
        intervalCount: program.intervalMonths,
      },
    },
    deliveryPolicy: {
      recurring: {
        interval: "MONTH",
        intervalCount: program.intervalMonths,
      },
    },
    inventoryPolicy: {
      reserve: "ON_FULFILLMENT",
    },
  };
}

export function sellingPlanGroupInputForProgram(program) {
  const planInput = sellingPlanInputForProgram(program, program.sellingPlanId);

  return {
    name: program.name,
    merchantCode: `subscription-ops-${program.id}`,
    options: ["Delivery cadence"],
    ...(program.sellingPlanId
      ? { sellingPlansToUpdate: [planInput] }
      : { sellingPlansToCreate: [planInput] }),
  };
}

export async function syncSellingPlanGroup(admin, program) {
  const productIds = productIdsForProgram(program);

  if (productIds.length === 0) {
    throw new Error(
      "Add at least one Shopify product ID before syncing the selling plan.",
    );
  }

  if (!program.sellingPlanGroupId) {
    return createSellingPlanGroup(admin, program, productIds);
  }

  const current = await getSellingPlanGroup(admin, program.sellingPlanGroupId);
  const sellingPlanId =
    program.sellingPlanId ?? current?.sellingPlans.edges[0]?.node.id ?? null;
  const updatePayload = await updateSellingPlanGroup(admin, {
    ...program,
    sellingPlanId,
  });

  await syncSellingPlanProducts(
    admin,
    program.sellingPlanGroupId,
    current?.products.nodes.map((node) => node.id) ?? [],
    productIds,
  );
  const updatedSellingPlanId =
    updatePayload.sellingPlanGroup?.sellingPlans.edges[0]?.node.id ??
    sellingPlanId;

  await db.subscriptionProgram.update({
    where: { id: program.id },
    data: {
      status: "published",
      sellingPlanId: updatedSellingPlanId,
    },
  });

  return {
    action: "synced",
    sellingPlanGroupId: program.sellingPlanGroupId,
    sellingPlanId: updatedSellingPlanId,
  };
}

async function createSellingPlanGroup(admin, program, productIds) {
  const response = await admin.graphql(
    `#graphql
      mutation CreateSubscriptionSellingPlan(
        $input: SellingPlanGroupInput!
        $resources: SellingPlanGroupResourceInput!
      ) {
        sellingPlanGroupCreate(input: $input, resources: $resources) {
          sellingPlanGroup {
            id
            sellingPlans(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: sellingPlanGroupInputForProgram(program),
        resources: {
          productIds,
        },
      },
    },
  );
  const payload = await mutationPayload(response, "sellingPlanGroupCreate");

  await db.subscriptionProgram.update({
    where: { id: program.id },
    data: {
      status: "published",
      sellingPlanGroupId: payload.sellingPlanGroup.id,
      sellingPlanId:
        payload.sellingPlanGroup.sellingPlans.edges[0]?.node.id ?? null,
    },
  });

  return {
    action: "created",
    sellingPlanGroupId: payload.sellingPlanGroup.id,
    sellingPlanId:
      payload.sellingPlanGroup.sellingPlans.edges[0]?.node.id ?? null,
  };
}

async function updateSellingPlanGroup(admin, program) {
  const response = await admin.graphql(
    `#graphql
      mutation UpdateSubscriptionSellingPlan(
        $id: ID!
        $input: SellingPlanGroupInput!
      ) {
        sellingPlanGroupUpdate(id: $id, input: $input) {
          sellingPlanGroup {
            id
            sellingPlans(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        id: program.sellingPlanGroupId,
        input: sellingPlanGroupInputForProgram(program),
      },
    },
  );

  return mutationPayload(response, "sellingPlanGroupUpdate");
}

async function getSellingPlanGroup(admin, sellingPlanGroupId) {
  const response = await admin.graphql(
    `#graphql
      query SubscriptionSellingPlanGroup($id: ID!) {
        sellingPlanGroup(id: $id) {
          products(first: 250) {
            nodes {
              id
            }
          }
          sellingPlans(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `,
    { variables: { id: sellingPlanGroupId } },
  );
  const json = await response.json();

  return json.data?.sellingPlanGroup ?? null;
}

async function syncSellingPlanProducts(
  admin,
  sellingPlanGroupId,
  currentProductIds,
  desiredProductIds,
) {
  const current = new Set(currentProductIds);
  const desired = new Set(desiredProductIds);
  const toAdd = desiredProductIds.filter((id) => !current.has(id));
  const toRemove = currentProductIds.filter((id) => !desired.has(id));

  if (toAdd.length > 0) {
    await productMutation(
      admin,
      "sellingPlanGroupAddProducts",
      sellingPlanGroupId,
      toAdd,
    );
  }

  if (toRemove.length > 0) {
    await productMutation(
      admin,
      "sellingPlanGroupRemoveProducts",
      sellingPlanGroupId,
      toRemove,
    );
  }
}

async function productMutation(
  admin,
  mutationName,
  sellingPlanGroupId,
  productIds,
) {
  const response = await admin.graphql(
    `#graphql
      mutation SyncSubscriptionSellingPlanProducts($id: ID!, $productIds: [ID!]!) {
        ${mutationName}(id: $id, productIds: $productIds) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { variables: { id: sellingPlanGroupId, productIds } },
  );
  const json = await response.json();
  const errors = json.data?.[mutationName]?.userErrors ?? [];

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(" "));
  }
}

async function mutationPayload(response, name) {
  const json = await response.json();
  const payload = json.data?.[name];
  const errors = payload?.userErrors ?? [];

  if (errors.length > 0 || !payload?.sellingPlanGroup) {
    throw new Error(
      errors.map((error) => error.message).join(" ") ||
        "Shopify did not return a selling plan group.",
    );
  }

  return {
    ...payload,
    sellingPlanGroup: payload.sellingPlanGroup,
  };
}
