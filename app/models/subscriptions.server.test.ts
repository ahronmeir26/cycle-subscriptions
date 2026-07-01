import { describe, expect, it } from "vitest";

import {
  buildAccountIdentityKey,
  buildCycleDedupeKey,
  nextRewardCycleFor,
  normalizeProductGids,
} from "./subscriptions.server";

describe("subscription helpers", () => {
  it("prefers the stable subscription contract identity", () => {
    expect(
      buildAccountIdentityKey({
        contractId: "gid://shopify/SubscriptionContract/1",
        customerId: "gid://shopify/Customer/2",
        customerEmail: "USER@example.com",
      }),
    ).toBe("contract:gid://shopify/SubscriptionContract/1");
  });

  it("falls back to customer and normalized email identities", () => {
    expect(
      buildAccountIdentityKey({
        customerId: "gid://shopify/Customer/2",
        customerEmail: "USER@example.com",
      }),
    ).toBe("customer:gid://shopify/Customer/2");
    expect(buildAccountIdentityKey({ customerEmail: "USER@example.com" })).toBe(
      "email:user@example.com",
    );
  });

  it("builds a cycle dedupe key from webhook id before order id", () => {
    expect(
      buildCycleDedupeKey({
        shop: "example.myshopify.com",
        sourceEventId: "webhook-1",
        orderId: "order-1",
      }),
    ).toBe("webhook:example.myshopify.com:webhook-1");
    expect(
      buildCycleDedupeKey({
        shop: "example.myshopify.com",
        orderId: "order-1",
      }),
    ).toBe("order:example.myshopify.com:order-1");
  });

  it("calculates the next unearned reward cycle", () => {
    expect(nextRewardCycleFor(0, 12)).toBe(12);
    expect(nextRewardCycleFor(1, 12)).toBe(12);
    expect(nextRewardCycleFor(12, 12)).toBe(24);
    expect(nextRewardCycleFor(13, 12)).toBe(24);
  });

  it("normalizes numeric product ids into Shopify GIDs", () => {
    expect(normalizeProductGids("123, gid://shopify/Product/456\n789")).toBe(
      "gid://shopify/Product/123,gid://shopify/Product/456,gid://shopify/Product/789",
    );
  });
});
