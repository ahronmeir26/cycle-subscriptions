ALTER TABLE "SubscriptionProgram"
ADD COLUMN "notifyRewards" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "autoSyncSellingPlan" BOOLEAN NOT NULL DEFAULT false;
