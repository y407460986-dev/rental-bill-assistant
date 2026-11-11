BEGIN;
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authUserId" TEXT,
ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "RentalApplication" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "AllocationPolicyVersion" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "RuleConfirmation" ADD COLUMN     "demoKey" TEXT;

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN     "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storagePath" TEXT;

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "captureRequestKey" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_billId_key" ON "ProcessingJob"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_demoKey_key" ON "User"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "Property_demoKey_key" ON "Property"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "Room_demoKey_key" ON "Room"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "RentalApplication_demoKey_key" ON "RentalApplication"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_demoKey_key" ON "Tenancy"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationPolicyVersion_demoKey_key" ON "AllocationPolicyVersion"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConfirmation_demoKey_key" ON "RuleConfirmation"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_captureRequestKey_key" ON "PaymentAttempt"("captureRequestKey");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ProcessingJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_status_valid" CHECK (status IN ('QUEUED','PROCESSING','NEEDS_REVIEW','READY','FAILED'));
CREATE UNIQUE INDEX "PaymentAttempt_one_pending" ON "PaymentAttempt"("chargeId") WHERE status='PENDING';
CREATE UNIQUE INDEX "PaymentAttempt_one_completed" ON "PaymentAttempt"("chargeId") WHERE status='COMPLETED';

CREATE FUNCTION protect_published_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('PUBLISHED','SUPERSEDED') THEN RAISE EXCEPTION 'Published versions are immutable'; END IF;
 RETURN OLD;
END; $$;
CREATE TRIGGER bill_version_immutable BEFORE UPDATE OR DELETE ON "BillVersion" FOR EACH ROW
 WHEN (OLD.status IN ('PUBLISHED','SUPERSEDED')) EXECUTE FUNCTION protect_published_version();

CREATE FUNCTION protect_published_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_status text;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT status::text INTO version_status FROM "BillVersion" WHERE id=NEW."billVersionId" FOR UPDATE;
 ELSE
  SELECT status::text INTO version_status FROM "BillVersion" WHERE id=OLD."billVersionId" FOR UPDATE;
 END IF;
 IF version_status IN ('PUBLISHED','SUPERSEDED') THEN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Published charges are immutable'; END IF;
  IF (to_jsonb(NEW)-'confirmedAt') IS DISTINCT FROM (to_jsonb(OLD)-'confirmedAt') THEN RAISE EXCEPTION 'Published charge amounts are immutable'; END IF;
  IF OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN RAISE EXCEPTION 'Charge confirmation is immutable'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER charge_immutable BEFORE INSERT OR UPDATE OR DELETE ON "Charge" FOR EACH ROW EXECUTE FUNCTION protect_published_charge();
COMMIT;
