ALTER TABLE "SubscriptionAccount"
ADD COLUMN "identityKey" TEXT NOT NULL DEFAULT '';

UPDATE "SubscriptionAccount"
SET "identityKey" = CASE
  WHEN "contractId" IS NOT NULL AND "contractId" <> '' THEN 'contract:' || "contractId"
  WHEN "customerId" IS NOT NULL AND "customerId" <> '' THEN 'customer:' || "customerId"
  WHEN "customerEmail" IS NOT NULL AND "customerEmail" <> '' THEN 'email:' || lower("customerEmail")
  ELSE 'account:' || "id"
END
WHERE "identityKey" = '';

ALTER TABLE "SubscriptionEvent"
ADD COLUMN "dedupeKey" TEXT,
ADD COLUMN "metadata" JSONB;

CREATE INDEX "SubscriptionAccount_identityKey_idx" ON "SubscriptionAccount"("identityKey");
CREATE UNIQUE INDEX "SubscriptionEvent_dedupeKey_key" ON "SubscriptionEvent"("dedupeKey");
