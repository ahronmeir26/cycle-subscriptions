import db from "../db.server";

export type SubscriptionProgramConfig = {
  name: string;
  shirtQuantity: number;
  intervalMonths: number;
  freeEveryCycles: number;
  productGids: string;
};

export type OrderCycleInput = {
  shop: string;
  programId?: string | null;
  orderId?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  contractId?: string | null;
  note?: string | null;
};

export function normalizeProductGids(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      /^\d+$/.test(item) ? `gid://shopify/Product/${item}` : item,
    )
    .join(",");
}

export function parsePositiveInteger(
  value: FormDataEntryValue | null,
  fallback: number,
  bounds: { min: number; max: number },
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, bounds.min), bounds.max);
}

export async function getOrCreateProgram(shop: string) {
  const existing = await db.subscriptionProgram.findFirst({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return db.subscriptionProgram.create({
    data: {
      shop,
      name: "Shirt replenishment",
      shirtQuantity: 2,
      intervalMonths: 2,
      freeEveryCycles: 12,
      status: "draft",
    },
  });
}

export async function getSelectedProgram(shop: string, programId?: string | null) {
  if (programId) {
    const selected = await db.subscriptionProgram.findFirst({
      where: { id: programId, shop },
    });

    if (selected) return selected;
  }

  return getOrCreateProgram(shop);
}

export async function createProgram(
  shop: string,
  config: SubscriptionProgramConfig,
) {
  return db.subscriptionProgram.create({
    data: {
      shop,
      name: config.name || "Shirt replenishment",
      shirtQuantity: config.shirtQuantity,
      intervalMonths: config.intervalMonths,
      freeEveryCycles: config.freeEveryCycles,
      productGids: config.productGids,
      status: "configured",
    },
  });
}

export async function saveProgram(
  shop: string,
  id: string,
  config: SubscriptionProgramConfig,
) {
  return db.subscriptionProgram.update({
    where: { id, shop },
    data: {
      name: config.name || "Shirt replenishment",
      shirtQuantity: config.shirtQuantity,
      intervalMonths: config.intervalMonths,
      freeEveryCycles: config.freeEveryCycles,
      productGids: config.productGids,
      status: "configured",
    },
  });
}

export async function recordOrderCycle(input: OrderCycleInput) {
  const program = await getSelectedProgram(input.shop, input.programId);
  const lookup = input.contractId
    ? { contractId: input.contractId }
    : input.customerId
      ? { customerId: input.customerId }
      : { customerEmail: input.customerEmail ?? "unknown" };

  const existing = await db.subscriptionAccount.findFirst({
    where: {
      shop: input.shop,
      ...lookup,
    },
  });

  const paidCycles = (existing?.paidCycles ?? 0) + 1;
  const earnedReward =
    program.freeEveryCycles > 0 && paidCycles % program.freeEveryCycles === 0;
  const nextRewardCycle = earnedReward
    ? paidCycles + program.freeEveryCycles
    : existing?.nextRewardCycle ?? program.freeEveryCycles;

  return db.$transaction(async (tx) => {
    const account = existing
      ? await tx.subscriptionAccount.update({
          where: { id: existing.id },
          data: {
            programId: program.id,
            customerId: input.customerId ?? existing.customerId,
            customerEmail: input.customerEmail ?? existing.customerEmail,
            contractId: input.contractId ?? existing.contractId,
            paidCycles,
            nextRewardCycle,
            lastOrderId: input.orderId ?? existing.lastOrderId,
            status: "active",
          },
        })
      : await tx.subscriptionAccount.create({
          data: {
            shop: input.shop,
            programId: program.id,
            customerId: input.customerId,
            customerEmail: input.customerEmail,
            contractId: input.contractId,
            paidCycles,
            nextRewardCycle,
            lastOrderId: input.orderId,
            status: "active",
          },
        });

    await tx.subscriptionEvent.create({
      data: {
        shop: input.shop,
        programId: program.id,
        accountId: account.id,
        type: "cycle_recorded",
        orderId: input.orderId,
        cycleNumber: paidCycles,
        note: input.note,
      },
    });

    if (earnedReward) {
      await tx.subscriptionEvent.create({
        data: {
          shop: input.shop,
          programId: program.id,
          accountId: account.id,
          type: "reward_earned",
          orderId: input.orderId,
          cycleNumber: paidCycles,
          note: `Free shipment earned after ${paidCycles} paid cycles.`,
        },
      });
    }

    return { account, program, earnedReward };
  });
}

export async function getDashboard(shop: string, programId?: string | null) {
  const program = await getSelectedProgram(shop, programId);
  const [
    programs,
    activeAccounts,
    rewardEvents,
    fulfilledRewardEvents,
    recentEvents,
    topAccounts,
    subscriberAccounts,
  ] = await Promise.all([
      db.subscriptionProgram.findMany({
        where: { shop },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      db.subscriptionAccount.count({
        where: { shop, programId: program.id, status: "active" },
      }),
      db.subscriptionEvent.findMany({
        where: { shop, programId: program.id, type: "reward_earned" },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { account: true },
      }),
      db.subscriptionEvent.findMany({
        where: { shop, programId: program.id, type: "reward_fulfilled" },
        select: { accountId: true, cycleNumber: true },
      }),
      db.subscriptionEvent.findMany({
        where: { shop, programId: program.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { account: true },
      }),
      db.subscriptionAccount.findMany({
        where: { shop, programId: program.id },
        orderBy: [{ paidCycles: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }),
      db.subscriptionAccount.findMany({
        where: { shop, programId: program.id },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 25,
      }),
    ]);

  const fulfilledKeys = new Set(
    fulfilledRewardEvents.map(
      (event) => `${event.accountId ?? ""}:${event.cycleNumber ?? ""}`,
    ),
  );
  const pendingRewardEvents = rewardEvents.filter(
    (event) =>
      !fulfilledKeys.has(`${event.accountId ?? ""}:${event.cycleNumber ?? ""}`),
  );

  return {
    programs,
    program,
    activeAccounts,
    pendingRewards: pendingRewardEvents.length,
    pendingRewardEvents,
    recentEvents,
    topAccounts,
    subscriberAccounts,
  };
}
