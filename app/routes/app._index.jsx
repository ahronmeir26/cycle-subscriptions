import { useEffect, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import {
  createProgram,
  getDashboard,
  markRewardFulfilled,
  normalizeProductGids,
  parsePositiveInteger,
  recordOrderCycle,
  saveProgram,
} from "../models/subscriptions.server";
import { syncSellingPlanGroup } from "../models/selling-plans.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/subscriptions.module.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dashboard = await getDashboard(
    session.shop,
    url.searchParams.get("programId"),
  );
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

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const programId =
    String(formData.get("programId") ?? "") ||
    url.searchParams.get("programId");
  const dashboard = await getDashboard(session.shop, programId);
  const program = dashboard.program;

  if (intent === "create-program") {
    const created = await createProgram(
      session.shop,
      readProgramConfig(formData),
    );

    return redirect(`/app?programId=${created.id}`);
  }

  if (intent === "save-program") {
    const saved = await saveProgram(
      session.shop,
      program.id,
      readProgramConfig(formData),
    );

    if (saved.autoSyncSellingPlan && saved.sellingPlanGroupId) {
      await syncSellingPlanGroup(admin, saved);
    }

    return {
      status: "success",
      message:
        saved.autoSyncSellingPlan && saved.sellingPlanGroupId
          ? "Subscription program saved and selling plan synced."
          : "Subscription program saved.",
    };
  }

  if (intent === "publish-selling-plan") {
    try {
      const result = await syncSellingPlanGroup(admin, program);

      return {
        status: "success",
        message:
          result.action === "created"
            ? "Selling plan group published to Shopify."
            : "Selling plan group synced with Shopify.",
      };
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error ? error.message : "Selling plan sync failed.",
      };
    }
  }

  if (intent === "manual-override") {
    const operation = String(formData.get("operation") ?? "record-cycle");
    const accountId = String(formData.get("accountId") ?? "");
    const account = accountId
      ? await db.subscriptionAccount.findFirst({
          where: { id: accountId, shop: session.shop, programId: program.id },
        })
      : null;

    if (operation === "record-cycle") {
      const result = await recordOrderCycle({
        shop: session.shop,
        programId: program.id,
        customerEmail:
          account?.customerEmail ??
          String(formData.get("customerEmail") || "subscriber@example.com"),
        customerId: account?.customerId,
        contractId: account?.contractId,
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

    if (operation === "adjust-cycle") {
      if (!account) {
        return {
          status: "error",
          message: "Choose a subscriber before adjusting cycle count.",
        };
      }

      const paidCycles = parsePositiveInteger(formData.get("paidCycles"), 0, {
        min: 0,
        max: 240,
      });
      const nextRewardCycle =
        Math.ceil((paidCycles + 1) / program.freeEveryCycles) *
        program.freeEveryCycles;

      await db.$transaction([
        db.subscriptionAccount.update({
          where: { id: account.id },
          data: { paidCycles, nextRewardCycle },
        }),
        db.subscriptionEvent.create({
          data: {
            shop: session.shop,
            programId: program.id,
            accountId: account.id,
            type: "cycle_adjusted",
            cycleNumber: paidCycles,
            note: "Cycle count adjusted manually.",
          },
        }),
      ]);

      return {
        status: "success",
        message: "Subscriber cycle count adjusted.",
      };
    }

    if (operation === "fulfill-reward") {
      if (!account) {
        return {
          status: "error",
          message: "Choose a subscriber before fulfilling a reward.",
        };
      }

      await markRewardFulfilled({
        shop: session.shop,
        programId: program.id,
        accountId: account.id,
        cycleNumber: account.paidCycles,
        note: "Reward marked fulfilled manually.",
      });

      return {
        status: "success",
        message: "Reward marked fulfilled.",
      };
    }
  }

  if (intent === "fulfill-reward") {
    const eventId = String(formData.get("eventId") ?? "");
    const rewardEvent = await db.subscriptionEvent.findFirst({
      where: {
        id: eventId,
        shop: session.shop,
        programId: program.id,
        type: "reward_earned",
      },
    });

    if (!rewardEvent) {
      return {
        status: "error",
        message: "Reward event was not found.",
      };
    }

    await markRewardFulfilled({
      shop: session.shop,
      programId: program.id,
      rewardEventId: rewardEvent.id,
      note: "Reward marked fulfilled from the queue.",
    });

    return {
      status: "success",
      message: "Reward marked fulfilled.",
    };
  }

  if (intent === "save-settings") {
    await db.subscriptionProgram.update({
      where: { id: program.id },
      data: {
        notifyRewards: Boolean(formData.get("notifyRewards")),
        autoSyncSellingPlan: Boolean(formData.get("autoSyncSellingPlan")),
      },
    });

    return {
      status: "success",
      message: "Program settings saved.",
    };
  }

  return {
    status: "error",
    message: "Unknown action.",
  };
};

export default function Index() {
  const {
    programs,
    program,
    shop,
    activeAccounts,
    pendingRewards,
    pendingRewardEvents,
    recentEvents,
    subscriberAccounts,
  } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const [programModalMode, setProgramModalMode] = useState(null);
  const isSubmitting = navigation.state === "submitting";
  const productGids = program.productGids.split(",").filter(Boolean).join("\n");
  const cadenceLabel = `${program.shirtQuantity} shirts every ${program.intervalMonths} months`;

  useEffect(() => {
    if (actionData && "message" in actionData) {
      shopify.toast.show(actionData.message, {
        isError: actionData.status === "error",
      });
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Subscription operations">
      <div slot="primary-action" className={styles.headerActions}>
        <Form method="get" className={styles.programSwitcher}>
          <label className={styles.field}>
            <span>Program</span>
            <select
              name="programId"
              defaultValue={program.id}
              onChange={(event) => {
                if (event.currentTarget.value === "new-program") {
                  event.currentTarget.value = program.id;
                  setProgramModalMode("create");

                  return;
                }

                submit(event.currentTarget.form);
              }}
            >
              {programs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="new-program">New program</option>
            </select>
          </label>
        </Form>
        <ActionButton primary onClick={() => setProgramModalMode("create")}>
          New program
        </ActionButton>
      </div>

      <s-section>
        <div className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>{shop.name}</p>
            <h2>{program.name}</h2>
            <p>{cadenceLabel}</p>
          </div>
          <div className={styles.heroPanel}>
            <span className={styles.statusPill}>{program.status}</span>
            <strong>Reward cycle {program.freeEveryCycles}</strong>
            <span>{productSummary(program.productGids)}</span>
          </div>
        </div>
      </s-section>

      <s-section heading="Program">
        <div className={styles.programGrid}>
          <div className={styles.detailList}>
            <Detail label="Status" value={program.status} />
            <Detail label="Cadence" value={cadenceLabel} />
            <Detail
              label="Reward"
              value={`Free shipment every ${program.freeEveryCycles} paid cycles`}
            />
            <Detail
              label="Products"
              value={productSummary(program.productGids)}
            />
          </div>
          <div className={styles.actionColumn}>
            <ActionButton onClick={() => setProgramModalMode("edit")}>
              Edit program
            </ActionButton>
          </div>
        </div>
      </s-section>

      <s-section heading="Shopify selling plan">
        <div className={styles.publishGrid}>
          <div>
            <p className={styles.sectionLead}>
              {program.sellingPlanGroupId
                ? "This program is connected to a Shopify selling plan group."
                : "Publish this program to create its Shopify selling plan group."}
            </p>
            <p className={styles.metaText}>
              {program.sellingPlanGroupId
                ? program.sellingPlanGroupId
                : "No selling plan group yet."}
            </p>
          </div>
          <Form method="post" className={styles.inlineForm}>
            <input type="hidden" name="intent" value="publish-selling-plan" />
            <input type="hidden" name="programId" value={program.id} />
            <ActionButton type="submit" primary busy={isSubmitting}>
              {program.sellingPlanGroupId ? "Sync plan" : "Publish plan"}
            </ActionButton>
          </Form>
        </div>
      </s-section>

      <s-section heading="Overview">
        <div className={styles.metrics}>
          <Metric label="Active subscribers" value={activeAccounts} />
          <Metric label="Open rewards" value={pendingRewards} />
          <Metric label="Next reward cycle" value={program.freeEveryCycles} />
        </div>
      </s-section>

      <s-section heading="Subscribers">
        {subscriberAccounts.length === 0 ? (
          <s-paragraph>
            No subscribers have been recorded for this program.
          </s-paragraph>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Cycles</th>
                  <th>Next reward</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subscriberAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <strong>
                        {account.customerEmail ??
                          account.customerId ??
                          "Subscriber"}
                      </strong>
                      <span>
                        {account.contractId ??
                          account.lastOrderId ??
                          "No reference"}
                      </span>
                    </td>
                    <td>{account.paidCycles}</td>
                    <td>{account.nextRewardCycle}</td>
                    <td>{account.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      <s-section heading="Manual override">
        <Form method="post" className={styles.overrideGrid}>
          <input type="hidden" name="intent" value="manual-override" />
          <input type="hidden" name="programId" value={program.id} />
          <label className={styles.field}>
            <span>Subscriber</span>
            <select name="accountId">
              <option value="">New subscriber by email</option>
              {subscriberAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.customerEmail ?? account.customerId ?? "Subscriber"}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Email for new subscriber</span>
            <input
              name="customerEmail"
              type="email"
              placeholder="subscriber@example.com"
            />
          </label>
          <label className={styles.field}>
            <span>Action</span>
            <select name="operation" defaultValue="record-cycle">
              <option value="record-cycle">Record paid cycle</option>
              <option value="adjust-cycle">Adjust cycle count</option>
              <option value="fulfill-reward">Mark reward fulfilled</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Cycle count</span>
            <input name="paidCycles" min="0" max="240" type="number" />
          </label>
          <label className={styles.field}>
            <span>Order reference</span>
            <input name="orderId" placeholder="manual-1001" />
          </label>
          <div className={styles.actionRow}>
            <ActionButton type="submit" busy={isSubmitting}>
              Apply
            </ActionButton>
          </div>
        </Form>
      </s-section>

      <s-section heading="Settings">
        <Form method="post" className={styles.settingsForm}>
          <input type="hidden" name="intent" value="save-settings" />
          <input type="hidden" name="programId" value={program.id} />
          <label>
            <input
              name="notifyRewards"
              type="checkbox"
              defaultChecked={program.notifyRewards}
            />
            Notify staff when rewards are queued
          </label>
          <label>
            <input
              name="autoSyncSellingPlan"
              type="checkbox"
              defaultChecked={program.autoSyncSellingPlan}
            />
            Auto-sync selling plan after program edits
          </label>
          <div className={styles.actionRow}>
            <ActionButton type="submit" busy={isSubmitting}>
              Save settings
            </ActionButton>
          </div>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Reward queue">
        {pendingRewardEvents.length === 0 ? (
          <s-paragraph>No free-shipment milestones are waiting.</s-paragraph>
        ) : (
          <div className={styles.accountList}>
            {pendingRewardEvents.map((event) => (
              <div className={styles.accountItem} key={event.id}>
                <div>
                  <strong>
                    {event.account?.customerEmail ??
                      event.account?.customerId ??
                      "Subscriber"}
                  </strong>
                  <span>Cycle {event.cycleNumber ?? "-"}</span>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="fulfill-reward" />
                  <input type="hidden" name="programId" value={program.id} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <ActionButton type="submit" busy={isSubmitting}>
                    Fulfill
                  </ActionButton>
                </Form>
              </div>
            ))}
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading="Activity ledger">
        {recentEvents.length === 0 ? (
          <s-paragraph>Subscription activity will appear here.</s-paragraph>
        ) : (
          <div className={styles.eventList}>
            {recentEvents.map((event) => (
              <div className={styles.eventItem} key={event.id}>
                <span className={styles.eventType}>
                  {formatEventType(event.type)}
                </span>
                <strong>
                  {event.account?.customerEmail ??
                    event.account?.customerId ??
                    "Program"}
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

      {programModalMode ? (
        <ProgramModal
          isSubmitting={isSubmitting}
          mode={programModalMode}
          productGids={productGids}
          program={program}
          onClose={() => setProgramModalMode(null)}
        />
      ) : null}
    </s-page>
  );
}

function readProgramConfig(formData) {
  return {
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
  };
}

function ActionButton({
  busy = false,
  children,
  className = "",
  disabled,
  primary = false,
  type = "button",
  ...props
}) {
  return (
    <button
      aria-busy={busy || undefined}
      className={[styles.button, primary ? styles.primaryButton : "", className]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || busy}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

function ProgramModal({ isSubmitting, mode, productGids, program, onClose }) {
  const isCreate = mode === "create";

  return (
    <div
      aria-labelledby="program-modal-title"
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 id="program-modal-title">
            {isCreate ? "New program" : "Edit program"}
          </h2>
          <button
            aria-label="Close program setup"
            className={styles.closeButton}
            type="button"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <Form method="post" className={styles.formGrid}>
          <input
            type="hidden"
            name="intent"
            value={isCreate ? "create-program" : "save-program"}
          />
          {!isCreate ? (
            <input type="hidden" name="programId" value={program.id} />
          ) : null}
          <label className={styles.field}>
            <span>Program name</span>
            <input
              name="name"
              defaultValue={isCreate ? "" : program.name}
              placeholder="Shirt replenishment"
            />
          </label>
          <label className={styles.field}>
            <span>Shirts per shipment</span>
            <input
              min="1"
              max="6"
              name="shirtQuantity"
              type="number"
              defaultValue={isCreate ? 2 : program.shirtQuantity}
            />
          </label>
          <label className={styles.field}>
            <span>Billing and shipping interval</span>
            <select
              name="intervalMonths"
              defaultValue={isCreate ? 2 : program.intervalMonths}
            >
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
              defaultValue={isCreate ? 12 : program.freeEveryCycles}
            />
          </label>
          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Shopify product IDs</span>
            <textarea
              name="productGids"
              defaultValue={isCreate ? "" : productGids}
              placeholder="gid://shopify/Product/1234567890"
              rows={4}
            />
          </label>
          <div className={styles.actionRow}>
            <ActionButton type="submit" busy={isSubmitting}>
              {isCreate ? "Create program" : "Save program"}
            </ActionButton>
          </div>
        </Form>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function productSummary(productGids) {
  const ids = productGids
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length === 0) return "No products selected";
  if (ids.length === 1) return ids[0];

  return `${ids.length} products selected`;
}

function formatEventType(type) {
  return type.replace(/_/g, " ");
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
