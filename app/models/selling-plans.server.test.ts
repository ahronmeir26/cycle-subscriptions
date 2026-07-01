import { describe, expect, it } from "vitest";

import {
  productIdsForProgram,
  sellingPlanGroupInputForProgram,
  sellingPlanInputForProgram,
} from "./selling-plans.server";

describe("selling plan helpers", () => {
  it("parses product GIDs from saved program config", () => {
    expect(
      productIdsForProgram({
        productGids:
          "gid://shopify/Product/1, gid://shopify/Product/2,,gid://shopify/Product/3",
      }),
    ).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
      "gid://shopify/Product/3",
    ]);
  });

  it("builds a subscription selling plan input from cadence settings", () => {
    expect(
      sellingPlanInputForProgram(
        {
          id: "program-1",
          name: "Shirt replenishment",
          shirtQuantity: 2,
          intervalMonths: 2,
        },
        "gid://shopify/SellingPlan/1",
      ),
    ).toMatchObject({
      id: "gid://shopify/SellingPlan/1",
      name: "2 shirts every 2 months",
      options: ["Every 2 months"],
      category: "SUBSCRIPTION",
      billingPolicy: { recurring: { interval: "MONTH", intervalCount: 2 } },
      deliveryPolicy: { recurring: { interval: "MONTH", intervalCount: 2 } },
    });
  });

  it("updates an existing selling plan when the program has a plan id", () => {
    const input = sellingPlanGroupInputForProgram({
      id: "program-1",
      name: "Shirt replenishment",
      shirtQuantity: 2,
      intervalMonths: 2,
      sellingPlanId: "gid://shopify/SellingPlan/1",
    });

    expect(input).toMatchObject({
      name: "Shirt replenishment",
      merchantCode: "subscription-ops-program-1",
      sellingPlansToUpdate: [
        {
          id: "gid://shopify/SellingPlan/1",
        },
      ],
    });
    expect(input).not.toHaveProperty("sellingPlansToCreate");
  });
});
