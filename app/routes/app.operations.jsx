import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { getDashboard } from "../models/subscriptions.server";
import { authenticate } from "../shopify.server";
import styles from "../styles/operations.module.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const { program } = await getDashboard(
    session.shop,
    url.searchParams.get("programId"),
  );
  const [earnedRewardEvents, fulfilledRewardEvents, cycleEvents] =
    await Promise.all([
      db.subscriptionEvent.findMany({
        where: {
          shop: session.shop,
          programId: program.id,
          type: "reward_earned",
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { account: true },
      }),
      db.subscriptionEvent.findMany({
        where: {
          shop: session.shop,
          programId: program.id,
          type: "reward_fulfilled",
        },
        select: { accountId: true, cycleNumber: true },
      }),
      db.subscriptionEvent.findMany({
        where: {
          shop: session.shop,
          programId: program.id,
          type: "cycle_recorded",
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { account: true },
      }),
    ]);
  const fulfilledKeys = new Set(
    fulfilledRewardEvents.map(
      (event) => `${event.accountId ?? ""}:${event.cycleNumber ?? ""}`,
    ),
  );
  const rewardEvents = earnedRewardEvents.filter(
    (event) =>
      !fulfilledKeys.has(`${event.accountId ?? ""}:${event.cycleNumber ?? ""}`),
  );

  return { program, rewardEvents, cycleEvents };
};

export default function OperationsPage() {
  const { program, rewardEvents, cycleEvents } = useLoaderData();

  return (
    <s-page heading="Operations">
      <s-section heading="Reward queue">
        {rewardEvents.length === 0 ? (
          <s-paragraph>No free-shipment milestones are waiting.</s-paragraph>
        ) : (
          <div className={styles.list}>
            {rewardEvents.map((event) => (
              <div className={styles.row} key={event.id}>
                <div>
                  <strong>
                    {event.account?.customerEmail ??
                      event.account?.customerId ??
                      "Subscriber"}
                  </strong>
                  <span>
                    Cycle {event.cycleNumber} on{" "}
                    {new Date(event.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span className={styles.badge}>Free shipment</span>
              </div>
            ))}
          </div>
        )}
      </s-section>

      <s-section heading="Cycle ledger">
        {cycleEvents.length === 0 ? (
          <s-paragraph>No paid cycles have been recorded yet.</s-paragraph>
        ) : (
          <div className={styles.list}>
            {cycleEvents.map((event) => (
              <div className={styles.row} key={event.id}>
                <div>
                  <strong>
                    {event.account?.customerEmail ??
                      event.account?.customerId ??
                      "Subscriber"}
                  </strong>
                  <span>
                    Cycle {event.cycleNumber} · {event.orderId ?? "No order ID"}
                  </span>
                </div>
                <span className={styles.badgeMuted}>{event.type}</span>
              </div>
            ))}
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading="Current program">
        <div className={styles.summary}>
          <span>{program.name}</span>
          <strong>
            {program.shirtQuantity} shirts every {program.intervalMonths} months
          </strong>
          <span>Reward cycle: {program.freeEveryCycles}</span>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
