import { Prisma } from "@prisma/client";

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
  sourceEventId?: string | null;
  metadata?: Prisma.InputJsonValue;
  note?: string | null;
};

export type OrderCycleResult = {
  account: Awaited<ReturnType<typeof db.subscriptionAccount.findFirst>>;
  program: Awaited<ReturnType<typeof getSelectedProgram>>;
  earnedReward: boolean;
  duplicate: boolean;
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

export type RewardSettingsInput = {
  name: string;
  shirtQuantity: number;
  intervalMonths: number;
  freeEveryCycles: number;
  notifyRewards: boolean;
  autoSyncSellingPlan: boolean;
};

export async function updateRewardSettings(
  shop: string,
  id: string,
  settings: RewardSettingsInput,
) {
  return db.subscriptionProgram.update({
    where: { id, shop },
    data: {
      name: settings.name || "Shirt replenishment",
      shirtQuantity: settings.shirtQuantity,
      intervalMonths: settings.intervalMonths,
      freeEveryCycles: settings.freeEveryCycles,
      notifyRewards: settings.notifyRewards,
      autoSyncSellingPlan: settings.autoSyncSellingPlan,
    },
  });
}

export function parseBoolean(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "true" || normalized === "on" || normalized === "1";
}

export function buildAccountIdentityKey(input: {
  contractId?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  orderId?: string | null;
}) {
  if (input.contractId) return `contract:${input.contractId}`;
  if (input.customerId) return `customer:${input.customerId}`;
  if (input.customerEmail) return `email:${input.customerEmail.toLowerCase()}`;
  if (input.orderId) return `order:${input.orderId}`;
  return "unknown";
}

export function buildCycleDedupeKey(input: {
  shop: string;
  sourceEventId?: string | null;
  orderId?: string | null;
}) {
  if (input.sourceEventId) return `webhook:${input.shop}:${input.sourceEventId}`;
  if (input.orderId) return `order:${input.shop}:${input.orderId}`;
  return null;
}

export function nextRewardCycleFor(paidCycles: number, freeEveryCycles: number) {
  if (freeEveryCycles <= 0) return 0;
  return (Math.floor(paidCycles / freeEveryCycles) + 1) * freeEveryCycles;
}

/**
 * Reward progress for a single subscriber, used by the customer account
 * extension. Matches the customer by GID, numeric id, or email so it works
 * regardless of which identifier the storefront/session token provides.
 */
export async function getSubscriberStatus(
  shop: string,
  lookup: { customerId?: string | null; customerEmail?: string | null },
) {
  const program = await getOrCreateProgram(shop);

  const orConditions: Array<Record<string, string>> = [];
  if (lookup.customerId) {
    orConditions.push({ customerId: lookup.customerId });
    const numeric = lookup.customerId.split("/").pop();
    if (numeric && numeric !== lookup.customerId) {
      orConditions.push({ customerId: numeric });
    }
  }
  if (lookup.customerEmail) {
    orConditions.push({ customerEmail: lookup.customerEmail });
  }

  const account = orConditions.length
    ? await db.subscriptionAccount.findFirst({
        where: { shop, OR: orConditions },
        orderBy: { updatedAt: "desc" },
      })
    : null;

  const paidCycles = account?.paidCycles ?? 0;
  const freeEveryCycles = program.freeEveryCycles;
  const cyclesIntoReward =
    freeEveryCycles > 0 ? paidCycles % freeEveryCycles : 0;
  const cyclesUntilReward =
    freeEveryCycles > 0 ? (freeEveryCycles - cyclesIntoReward) % freeEveryCycles : 0;
  const nextRewardCycle =
    freeEveryCycles > 0
      ? paidCycles + (cyclesUntilReward === 0 ? freeEveryCycles : cyclesUntilReward)
      : null;

  return {
    program: {
      id: program.id,
      name: program.name,
      shirtQuantity: program.shirtQuantity,
      intervalMonths: program.intervalMonths,
      freeEveryCycles,
    },
    enrolled: Boolean(account),
    status: account?.status ?? null,
    paidCycles,
    freeEveryCycles,
    cyclesUntilReward,
    nextRewardCycle,
    rewardReady: freeEveryCycles > 0 && paidCycles > 0 && cyclesIntoReward === 0,
  };
}

export async function recordOrderCycle(input: OrderCycleInput) {
  const program = await getSelectedProgram(input.shop, input.programId);
  const identityKey = buildAccountIdentityKey(input);
  const cycleDedupeKey = buildCycleDedupeKey(input);

  if (cycleDedupeKey) {
    const duplicateEvent = await db.subscriptionEvent.findUnique({
      where: { dedupeKey: cycleDedupeKey },
      include: { account: true, program: true },
    });

    if (duplicateEvent) {
      return {
        account: duplicateEvent.account,
        program: duplicateEvent.program ?? program,
        earnedReward: false,
        duplicate: true,
      };
    }
  }

  const existing = await db.subscriptionAccount.findFirst({
    where: {
      shop: input.shop,
      programId: program.id,
      identityKey,
    },
  });

  const paidCycles = (existing?.paidCycles ?? 0) + 1;
  const earnedReward =
    program.freeEveryCycles > 0 && paidCycles % program.freeEveryCycles === 0;
  const nextRewardCycle = earnedReward
    ? paidCycles + program.freeEveryCycles
    : nextRewardCycleFor(paidCycles, program.freeEveryCycles);

  try {
    return await db.$transaction(async (tx) => {
      const account = existing
        ? await tx.subscriptionAccount.update({
            where: { id: existing.id },
            data: {
              programId: program.id,
              identityKey,
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
              identityKey,
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
          dedupeKey: cycleDedupeKey,
          type: "cycle_recorded",
          orderId: input.orderId,
          cycleNumber: paidCycles,
          note: input.note,
          metadata: input.metadata,
        },
      });

      if (earnedReward) {
        const rewardDedupeKey = `reward:${input.shop}:${account.id}:${paidCycles}`;

        await tx.subscriptionEvent.create({
          data: {
            shop: input.shop,
            programId: program.id,
            accountId: account.id,
            dedupeKey: rewardDedupeKey,
            type: "reward_earned",
            orderId: input.orderId,
            cycleNumber: paidCycles,
            note: `Free shipment earned after ${paidCycles} paid cycles.`,
          },
        });

        if (program.notifyRewards) {
          await tx.subscriptionEvent.create({
            data: {
              shop: input.shop,
              programId: program.id,
              accountId: account.id,
              dedupeKey: `notify:${rewardDedupeKey}`,
              type: "staff_notification_queued",
              orderId: input.orderId,
              cycleNumber: paidCycles,
              note: "Staff notification queued for this free-shipment milestone.",
            },
          });
        }
      }

      return { account, program, earnedReward, duplicate: false };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      cycleDedupeKey
    ) {
      const duplicateEvent = await db.subscriptionEvent.findUnique({
        where: { dedupeKey: cycleDedupeKey },
        include: { account: true, program: true },
      });

      if (duplicateEvent) {
        return {
          account: duplicateEvent.account,
          program: duplicateEvent.program ?? program,
          earnedReward: false,
          duplicate: true,
        };
      }
    }

    throw error;
  }
}

export async function markRewardFulfilled(input: {
  shop: string;
  programId: string;
  rewardEventId?: string | null;
  accountId?: string | null;
  cycleNumber?: number | null;
  orderId?: string | null;
  note?: string | null;
}) {
  const rewardEvent = input.rewardEventId
    ? await db.subscriptionEvent.findFirst({
        where: {
          id: input.rewardEventId,
          shop: input.shop,
          programId: input.programId,
          type: "reward_earned",
        },
      })
    : null;
  const accountId = rewardEvent?.accountId ?? input.accountId ?? null;
  const cycleNumber = rewardEvent?.cycleNumber ?? input.cycleNumber ?? null;

  if (!accountId || cycleNumber === null) {
    throw new Error("Reward fulfillment needs an account and cycle number.");
  }

  const dedupeKey = `fulfill:${input.shop}:${accountId}:${cycleNumber}`;
  const existing = await db.subscriptionEvent.findUnique({
    where: { dedupeKey },
  });

  if (existing) return { event: existing, duplicate: true };

  const event = await db.subscriptionEvent.create({
    data: {
      shop: input.shop,
      programId: input.programId,
      accountId,
      dedupeKey,
      type: "reward_fulfilled",
      orderId: rewardEvent?.orderId ?? input.orderId,
      cycleNumber,
      note: input.note ?? "Reward marked fulfilled.",
    },
  });

  return { event, duplicate: false };
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
