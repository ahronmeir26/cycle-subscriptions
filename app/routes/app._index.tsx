import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import {
  getDashboard,
  normalizeProductGids,
  parsePositiveInteger,
  recordOrderCycle,
  saveProgram,
} from "../models/subscriptions.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/subscriptions.module.css";

type ActionResult = {
  status: "success" | "error";
  message: string;
};

type SellingPlanGroupResponse = {
  data?: {
    sellingPlanGroupCreate?: {
      sellingPlanGroup?: {
        id: string;
        sellingPlans: {
          edges: Array<{ node: { id: string } }>;
        };
      };
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const dashboard = await getDashboard(session.shop);
  const shopResponse = await admin.graphql(`#graphql
    query SubscriptionOpsShop {
      shop {
        name
        myshopifyDomain
      }
    }
  `);
  const shopJson = await shopResponse.json();

  return {
    ...dashboard,
    shop: shopJson.data.shop,
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const program = await getDashboard(session.shop).then((data) => data.program);

  if (intent === "save-program") {
    await saveProgram(session.shop, program.id, {
      name: String(formData.get("name") ?? "Shirt replenishment"),
      shirtQuantity: parsePositiveInteger(formData.get("shirtQuantity"), 2, {
        min: 1,
        max: 6,
      }),
      intervalMonths: parsePositiveInteger(formData.get("intervalMonths"), 2, {
        min: 1,
        max: 12,
      }),
      freeEveryCycles: parsePositiveInteger(formData.get("freeEveryCycles"), 12, {
        min: 2,
        max: 48,
      }),
      productGids: normalizeProductGids(formData.get("productGids")),
    });

    return {
      status: "success",
      message: "Subscription program saved.",
    };
  }

  if (intent === "publish-selling-plan") {
    const productIds = program.productGids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (productIds.length === 0) {
      return {
        status: "error",
        message:
          "Add at least one Shopify product ID before publishing the selling plan.",
      };
    }

    if (program.sellingPlanGroupId) {
      return {
        status: "success",
        message: "This program already has a Shopify selling plan group.",
      };
    }

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
          input: {
            name: program.name,
            merchantCode: `subscription-ops-${program.id}`,
            options: ["Delivery cadence"],
            sellingPlansToCreate: [
              {
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
              },
            ],
          },
          resources: {
            productIds,
          },
        },
      },
    );
    const json = (await response.json()) as SellingPlanGroupResponse;
    const payload = json.data?.sellingPlanGroupCreate;
    const errors = payload?.userErrors ?? [];

    if (errors.length > 0 || !payload?.sellingPlanGroup) {
      return {
        status: "error",
        message:
          errors.map((error) => error.message).join(" ") ||
          "Shopify did not create the selling plan group.",
      };
    }

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
      status: "success",
      message: "Selling plan group published to Shopify.",
    };
  }

  if (intent === "record-cycle") {
    const result = await recordOrderCycle({
      shop: session.shop,
      customerEmail: String(formData.get("customerEmail") || "subscriber@example.com"),
      orderId: String(formData.get("orderId") || `manual-${Date.now()}`),
      note: "Recorded manually in the app.",
    });

    return {
      status: "success",
      message: result.earnedReward
        ? "Paid cycle recorded. This subscriber earned a free shipment."
        : "Paid cycle recorded.",
    };
  }

  return {
    status: "error",
    message: "Unknown action.",
  };
};

export default function Index() {
  const {
    program,
    shop,
    activeAccounts,
    pendingRewards,
    recentEvents,
    topAccounts,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";
  const productGids = program.productGids.split(",").filter(Boolean).join("\n");
  const cadenceLabel = `${program.shirtQuantity} shirts / ${program.intervalMonths} months`;

  useEffect(() => {
    if (actionData?.message) {
      shopify.toast.show(actionData.message, {
        isError: actionData.status === "error",
      });
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Subscription operations">
      <s-button
        slot="primary-action"
        href="https://admin.shopify.com/store"
        target="_blank"
        variant="secondary"
      >
        Open Shopify admin
      </s-button>

      <s-section>
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>{shop.name}</p>
            <h2>Run recurring shirt programs without losing track of the edge cases.</h2>
            <p>
              Configure the billing cadence, publish a Shopify selling plan, and
              keep subscription milestones visible for operations.
            </p>
          </div>
          <div className={styles.heroPanel}>
            <span className={styles.statusPill}>{program.status}</span>
            <strong>{cadenceLabel}</strong>
            <span>Reward every {program.freeEveryCycles} paid cycles</span>
          </div>
        </div>
      </s-section>

      <s-section heading="Program setup">
        <Form method="post" className={styles.formGrid}>
          <input type="hidden" name="intent" value="save-program" />
          <label className={styles.field}>
            <span>Program name</span>
            <input name="name" defaultValue={program.name} />
          </label>
          <label className={styles.field}>
            <span>Shirts per shipment</span>
            <input
              min="1"
              max="6"
              name="shirtQuantity"
              type="number"
              defaultValue={program.shirtQuantity}
            />
          </label>
          <label className={styles.field}>
            <span>Billing and shipping interval</span>
            <select name="intervalMonths" defaultValue={program.intervalMonths}>
              <option value="1">Every month</option>
              <option value="2">Every 2 months</option>
              <option value="3">Every 3 months</option>
              <option value="6">Every 6 months</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Milestone reward cycle</span>
            <input
              min="2"
              max="48"
              name="freeEveryCycles"
              type="number"
              defaultValue={program.freeEveryCycles}
            />
          </label>
          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Shopify product IDs</span>
            <textarea
              name="productGids"
              defaultValue={productGids}
              placeholder="gid://shopify/Product/1234567890"
              rows={4}
            />
          </label>
          <div className={styles.actionRow}>
            <s-button type="submit" {...(isSubmitting ? { loading: true } : {})}>
              Save program
            </s-button>
          </div>
        </Form>
      </s-section>

      <s-section heading="Shopify selling plan">
        <div className={styles.publishGrid}>
          <div>
            <p className={styles.sectionLead}>
              Publish a selling plan group that bills and ships automatically on
              the configured cadence. The milestone reward stays tracked here so
              staff can fulfill it cleanly.
            </p>
            {program.sellingPlanGroupId ? (
              <p className={styles.metaText}>
                Selling plan group: {program.sellingPlanGroupId}
              </p>
            ) : (
              <p className={styles.metaText}>
                Add product IDs, save, then publish the selling plan group.
              </p>
            )}
          </div>
          <Form method="post" className={styles.inlineForm}>
            <input type="hidden" name="intent" value="publish-selling-plan" />
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Publish plan
            </s-button>
          </Form>
        </div>
      </s-section>

      <s-section heading="Operations pulse">
        <div className={styles.metrics}>
          <Metric label="Active subscribers" value={activeAccounts} />
          <Metric label="Open reward events" value={pendingRewards} />
          <Metric label="Next reward cycle" value={program.freeEveryCycles} />
        </div>
      </s-section>

      <s-section heading="Manual cycle test">
        <Form method="post" className={styles.testForm}>
          <input type="hidden" name="intent" value="record-cycle" />
          <label className={styles.field}>
            <span>Customer email</span>
            <input
              name="customerEmail"
              type="email"
              defaultValue="subscriber@example.com"
            />
          </label>
          <label className={styles.field}>
            <span>Order reference</span>
            <input name="orderId" placeholder="manual-1001" />
          </label>
          <s-button type="submit" {...(isSubmitting ? { loading: true } : {})}>
            Record paid cycle
          </s-button>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Milestone queue">
        {topAccounts.length === 0 ? (
          <s-paragraph>No subscriber cycles recorded yet.</s-paragraph>
        ) : (
          <div className={styles.accountList}>
            {topAccounts.map((account) => (
              <div className={styles.accountItem} key={account.id}>
                <strong>{account.customerEmail ?? account.customerId ?? "Subscriber"}</strong>
                <span>
                  {account.paidCycles} paid cycles, reward at cycle{" "}
                  {account.nextRewardCycle}
                </span>
              </div>
            ))}
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading="Recent activity">
        {recentEvents.length === 0 ? (
          <s-paragraph>Subscription activity will appear here.</s-paragraph>
        ) : (
          <div className={styles.eventList}>
            {recentEvents.map((event) => (
              <div className={styles.eventItem} key={event.id}>
                <span className={styles.eventType}>{event.type.replace("_", " ")}</span>
                <strong>
                  {event.account?.customerEmail ??
                    event.account?.customerId ??
                    "Subscriber"}
                </strong>
                <span>
                  Cycle {event.cycleNumber ?? "-"} ·{" "}
                  {new Date(event.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
