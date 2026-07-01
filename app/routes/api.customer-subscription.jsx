import { getSubscriberStatus } from "../models/subscriptions.server";
import { authenticate } from "../shopify.server";

/**
 * Public JSON endpoint for the customer account subscription extension.
 *
 * Authenticated with the customer account session token. Returns the
 * subscriber's reward progress (paid cycles, cycles until the next free
 * shipment) for the logged-in customer.
 */
function shopFromDest(dest) {
  const value = String(dest ?? "");

  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export const loader = async ({ request }) => {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);
  const shop = shopFromDest(sessionToken.dest);
  const customerId =
    typeof sessionToken.sub === "string" ? sessionToken.sub : null;
  const status = await getSubscriberStatus(shop, { customerId });

  return cors(
    new Response(JSON.stringify(status), {
      headers: { "Content-Type": "application/json" },
    }),
  );
};
