-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionProgram" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Shirt replenishment',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "shirtQuantity" INTEGER NOT NULL DEFAULT 2,
    "intervalMonths" INTEGER NOT NULL DEFAULT 2,
    "freeEveryCycles" INTEGER NOT NULL DEFAULT 12,
    "productGids" TEXT NOT NULL DEFAULT '',
    "sellingPlanGroupId" TEXT,
    "sellingPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAccount" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "programId" TEXT,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "contractId" TEXT,
    "paidCycles" INTEGER NOT NULL DEFAULT 0,
    "nextRewardCycle" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "programId" TEXT,
    "accountId" TEXT,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "cycleNumber" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionProgram_shop_idx" ON "SubscriptionProgram"("shop");

-- CreateIndex
CREATE INDEX "SubscriptionAccount_shop_idx" ON "SubscriptionAccount"("shop");

-- CreateIndex
CREATE INDEX "SubscriptionAccount_programId_idx" ON "SubscriptionAccount"("programId");

-- CreateIndex
CREATE INDEX "SubscriptionAccount_contractId_idx" ON "SubscriptionAccount"("contractId");

-- CreateIndex
CREATE INDEX "SubscriptionAccount_customerId_idx" ON "SubscriptionAccount"("customerId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_shop_idx" ON "SubscriptionEvent"("shop");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_programId_idx" ON "SubscriptionEvent"("programId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_accountId_idx" ON "SubscriptionEvent"("accountId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_type_idx" ON "SubscriptionEvent"("type");

-- AddForeignKey
ALTER TABLE "SubscriptionAccount" ADD CONSTRAINT "SubscriptionAccount_programId_fkey" FOREIGN KEY ("programId") REFERENCES "SubscriptionProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "SubscriptionProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SubscriptionAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
