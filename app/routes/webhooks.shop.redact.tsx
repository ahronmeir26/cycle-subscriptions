import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId } = await authenticate.webhook(request);

  console.info("shop_redact_webhook_received", {
    shop,
    topic,
    webhookId,
  });

  await db.$transaction([
    db.subscriptionEvent.deleteMany({ where: { shop } }),
    db.subscriptionAccount.deleteMany({ where: { shop } }),
    db.subscriptionProgram.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
