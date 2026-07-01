import { useEffect } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getSelectedProgram,
  parseBoolean,
  parsePositiveInteger,
  updateRewardSettings,
} from "../models/subscriptions.server";
import { syncSellingPlanGroup } from "../models/selling-plans.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/subscriptions.module.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const program = await getSelectedProgram(
    session.shop,
    url.searchParams.get("programId"),
  );

  return { program };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const formData = await request.formData();
  const programId =
    String(formData.get("programId") ?? "") ||
    url.searchParams.get("programId");
  const program = await getSelectedProgram(session.shop, programId);
  const updated = await updateRewardSettings(session.shop, program.id, {
    name: String(formData.get("name") ?? "").trim(),
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
    notifyRewards: parseBoolean(formData.get("notifyRewards")),
    autoSyncSellingPlan: parseBoolean(formData.get("autoSyncSellingPlan")),
  });

  if (updated.autoSyncSellingPlan && updated.sellingPlanGroupId) {
    try {
      await syncSellingPlanGroup(admin, updated);

      return {
        status: "success",
        message: "Reward rule saved and selling plan synced.",
      };
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error ? error.message : "Selling plan sync failed.",
      };
    }
  }

  return { status: "success", message: "Reward rule saved." };
};

export default function SettingsPage() {
  const { program } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData && "message" in actionData) {
      shopify.toast.show(actionData.message, {
        isError: actionData.status === "error",
      });
    }
  }, [actionData, shopify]);
  const rewardPreview =
    program.freeEveryCycles > 0
      ? `Every ${program.freeEveryCycles}th paid cycle earns a free shipment of ${program.shirtQuantity} shirt${program.shirtQuantity === 1 ? "" : "s"}.`
      : "Milestone rewards are disabled.";

  return (
    <s-page heading="Reward rule">
      <s-section heading="Milestone reward">
        <p className={styles.sectionLead}>{rewardPreview}</p>
        <Form method="post" className={styles.formGrid}>
          <input type="hidden" name="programId" value={program.id} />

          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Program name</span>
            <input
              name="name"
              defaultValue={program.name}
              placeholder="Shirt replenishment"
            />
          </label>

          <label className={styles.field}>
            <span>Shirts per shipment</span>
            <input
              name="shirtQuantity"
              type="number"
              min="1"
              max="6"
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
              <option value="12">Every 12 months</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Free shipment every N paid cycles</span>
            <input
              name="freeEveryCycles"
              type="number"
              min="2"
              max="48"
              defaultValue={program.freeEveryCycles}
            />
          </label>

          <label className={`${styles.field} ${styles.fullWidth}`}>
            <span>Notifications</span>
            <label className={styles.checkboxRow}>
              <input
                name="notifyRewards"
                type="checkbox"
                value="true"
                defaultChecked={program.notifyRewards}
              />
              Notify staff when a free shipment is earned
            </label>
            <label className={styles.checkboxRow}>
              <input
                name="autoSyncSellingPlan"
                type="checkbox"
                value="true"
                defaultChecked={program.autoSyncSellingPlan}
              />
              Auto-sync the Shopify selling plan after reward-rule edits
            </label>
          </label>

          <div className={styles.actionRow}>
            <button
              type="submit"
              aria-busy={isSubmitting || undefined}
              disabled={isSubmitting}
              className={`${styles.button} ${styles.primaryButton}`}
            >
              Save reward rule
            </button>
          </div>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
