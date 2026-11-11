BEGIN;
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('LANDLORD', 'TENANT');

-- CreateEnum
CREATE TYPE "RentalMode" AS ENUM ('WHOLE', 'ROOMS');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('ELECTRICITY', 'WATER', 'GAS');

-- CreateEnum
CREATE TYPE "AllocationMethod" AS ENUM ('EQUAL', 'PERSON_DAYS');

-- CreateEnum
CREATE TYPE "VacancyResponsibility" AS ENUM ('PENDING', 'LANDLORD', 'DISTRIBUTE');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR', 'USD');

-- CreateEnum
CREATE TYPE "BillVersionStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM ('TENANT_PREPAYMENT', 'LANDLORD_ADVANCE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "region" TEXT,
    "rentalMode" "RentalMode" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "advertisedRent" DECIMAL(14,2),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalApplication" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "tenantId" TEXT NOT NULL,
    "requestedStartDate" DATE NOT NULL,
    "requestedEndDate" DATE,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RentalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "tenantId" TEXT NOT NULL,
    "billingStartDate" DATE NOT NULL,
    "billingEndDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationPolicyVersion" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "policyKey" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "utilityType" "UtilityType" NOT NULL,
    "allocationMethod" "AllocationMethod" NOT NULL,
    "vacancyResponsibility" "VacancyResponsibility" NOT NULL DEFAULT 'PENDING',
    "effectiveStart" DATE NOT NULL,
    "effectiveEnd" DATE,
    "terms" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllocationPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConfirmation" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileUrl" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sourceLanguage" TEXT,
    "extractedData" JSONB,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "sourceDocumentId" TEXT NOT NULL,
    "utilityType" "UtilityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillVersion" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "status" "BillVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "servicePeriodStart" DATE,
    "servicePeriodEnd" DATE,
    "currency" "Currency" NOT NULL,
    "settlementTotal" DECIMAL(14,2),
    "advancePayments" DECIMAL(14,2),
    "amountDue" DECIMAL(14,2),
    "nextPeriodAdvance" DECIMAL(14,2),
    "allocationBase" DECIMAL(14,2),
    "landlordShare" DECIMAL(14,2),
    "extractedLineItems" JSONB,
    "reconciliationIssues" JSONB,
    "snapshot" JSONB,
    "inputFingerprint" TEXT,
    "publicationKey" TEXT,

    CONSTRAINT "BillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "kind" "ContributionKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "billVersionId" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "daysOccupied" INTEGER NOT NULL,
    "shareBeforeRounding" TEXT NOT NULL,
    "actualShare" DECIMAL(14,2) NOT NULL,
    "remainderCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountDue" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "explanationCN" TEXT,
    "explanationEN" TEXT,
    "calculationDetails" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeCredit" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ChargeCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "payeeMerchantId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Property_landlordId_idx" ON "Property"("landlordId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_id_propertyId_key" ON "Room"("id", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_propertyId_name_key" ON "Room"("propertyId", "name");

-- CreateIndex
CREATE INDEX "RentalApplication_propertyId_status_idx" ON "RentalApplication"("propertyId", "status");

-- CreateIndex
CREATE INDEX "RentalApplication_tenantId_status_idx" ON "RentalApplication"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_applicationId_key" ON "Tenancy"("applicationId");

-- CreateIndex
CREATE INDEX "Tenancy_propertyId_billingStartDate_idx" ON "Tenancy"("propertyId", "billingStartDate");

-- CreateIndex
CREATE INDEX "Tenancy_roomId_billingStartDate_idx" ON "Tenancy"("roomId", "billingStartDate");

-- CreateIndex
CREATE INDEX "Tenancy_tenantId_idx" ON "Tenancy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_id_tenantId_key" ON "Tenancy"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AllocationPolicyVersion_propertyId_utilityType_idx" ON "AllocationPolicyVersion"("propertyId", "utilityType");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationPolicyVersion_propertyId_policyKey_versionNumber_key" ON "AllocationPolicyVersion"("propertyId", "policyKey", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RuleConfirmation_policyVersionId_tenancyId_userId_key" ON "RuleConfirmation"("policyVersionId", "tenancyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_landlordId_fileHash_key" ON "SourceDocument"("landlordId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_sourceDocumentId_key" ON "Bill"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "Bill_propertyId_utilityType_idx" ON "Bill"("propertyId", "utilityType");

-- CreateIndex
CREATE UNIQUE INDEX "BillVersion_publicationKey_key" ON "BillVersion"("publicationKey");

-- CreateIndex
CREATE INDEX "BillVersion_billId_status_idx" ON "BillVersion"("billId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillVersion_billId_versionNumber_key" ON "BillVersion"("billId", "versionNumber");

-- CreateIndex
CREATE INDEX "Contribution_billId_payerId_idx" ON "Contribution"("billId", "payerId");

-- CreateIndex
CREATE INDEX "Charge_tenantId_idx" ON "Charge"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_billVersionId_tenancyId_key" ON "Charge"("billVersionId", "tenancyId");

-- CreateIndex
CREATE INDEX "ChargeCredit_contributionId_idx" ON "ChargeCredit"("contributionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeCredit_chargeId_contributionId_key" ON "ChargeCredit"("chargeId", "contributionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_paypalOrderId_key" ON "PaymentAttempt"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_paypalCaptureId_key" ON "PaymentAttempt"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_chargeId_status_idx" ON "PaymentAttempt"("chargeId", "status");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalApplication" ADD CONSTRAINT "RentalApplication_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalApplication" ADD CONSTRAINT "RentalApplication_roomId_propertyId_fkey" FOREIGN KEY ("roomId", "propertyId") REFERENCES "Room"("id", "propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalApplication" ADD CONSTRAINT "RentalApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RentalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_roomId_propertyId_fkey" FOREIGN KEY ("roomId", "propertyId") REFERENCES "Room"("id", "propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPolicyVersion" ADD CONSTRAINT "AllocationPolicyVersion_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPolicyVersion" ADD CONSTRAINT "AllocationPolicyVersion_roomId_propertyId_fkey" FOREIGN KEY ("roomId", "propertyId") REFERENCES "Room"("id", "propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConfirmation" ADD CONSTRAINT "RuleConfirmation_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "AllocationPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConfirmation" ADD CONSTRAINT "RuleConfirmation_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleConfirmation" ADD CONSTRAINT "RuleConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_roomId_propertyId_fkey" FOREIGN KEY ("roomId", "propertyId") REFERENCES "Room"("id", "propertyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillVersion" ADD CONSTRAINT "BillVersion_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_billVersionId_fkey" FOREIGN KEY ("billVersionId") REFERENCES "BillVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tenancyId_tenantId_fkey" FOREIGN KEY ("tenancyId", "tenantId") REFERENCES "Tenancy"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeCredit" ADD CONSTRAINT "ChargeCredit_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeCredit" ADD CONSTRAINT "ChargeCredit_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Raw statement totals may be signed (supplier refunds); only allocated charges are nonnegative.
ALTER TABLE "Property" ADD CONSTRAINT "Property_rent_nonnegative" CHECK ("advertisedRent" IS NULL OR "advertisedRent" >= 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "RentalApplication" ADD CONSTRAINT "RentalApplication_dates_ordered" CHECK ("requestedEndDate" IS NULL OR "requestedEndDate" > "requestedStartDate");
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_dates_ordered" CHECK ("billingEndDate" IS NULL OR "billingEndDate" > "billingStartDate");
ALTER TABLE "AllocationPolicyVersion" ADD CONSTRAINT "AllocationPolicyVersion_version_positive" CHECK ("versionNumber" > 0);
ALTER TABLE "AllocationPolicyVersion" ADD CONSTRAINT "AllocationPolicyVersion_dates_ordered" CHECK ("effectiveEnd" IS NULL OR "effectiveEnd" > "effectiveStart");
ALTER TABLE "BillVersion" ADD CONSTRAINT "BillVersion_version_positive" CHECK ("versionNumber" > 0);
ALTER TABLE "BillVersion" ADD CONSTRAINT "BillVersion_dates_ordered" CHECK ("servicePeriodStart" IS NULL OR "servicePeriodEnd" IS NULL OR "servicePeriodEnd" > "servicePeriodStart");
ALTER TABLE "BillVersion" ADD CONSTRAINT "BillVersion_allocation_nonnegative" CHECK (("allocationBase" IS NULL OR "allocationBase" >= 0) AND ("landlordShare" IS NULL OR "landlordShare" >= 0));
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_days_positive" CHECK ("daysOccupied" > 0);
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_amounts_valid" CHECK ("actualShare" >= 0 AND "netAmountDue" >= 0 AND "netAmountDue" <= "actualShare");
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_remainder_valid" CHECK ("remainderCents" IN (0, 1));
ALTER TABLE "ChargeCredit" ADD CONSTRAINT "ChargeCredit_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_amount_positive" CHECK ("amount" > 0);

-- Prisma uses the server database owner. No browser Data API policies are granted.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenancy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AllocationPolicyVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleConfirmation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SourceDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Charge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChargeCredit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAttempt" ENABLE ROW LEVEL SECURITY;
COMMIT;
