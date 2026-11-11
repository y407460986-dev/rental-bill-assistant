import { it, expect, vi } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
const ctx = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => ctx.db }));
import { generateDraft, publish, calculation, reviewDates } from "../workflow";
import { ownedBill, ownedCharge } from "../access";
import { synthetic } from "../../testing/synthetic";
import { utilityStatement } from "../../testing/utility-statement";
import { reconcile } from "../../contracts/extraction";
it("real DB: billing, isolation, stale inputs, publication and immutable values; rolls back", async () => {
  const db = new PrismaClient();
  const marker = randomUUID();
  const rollback = new Error("ROLLBACK_TEST");
  try {
    await db.$transaction(
      async (tx) => {
        ctx.db = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return async (fn: (tx: Prisma.TransactionClient) => unknown) =>
                fn(tx);
            return Reflect.get(target, key);
          },
        });
        const owner = await tx.user.create({
          data: {
            email: marker + "@example.invalid",
            name: "test owner",
            role: "LANDLORD",
          },
        });
        const property = await tx.property.create({
          data: {
            landlordId: owner.id,
            title: "integration",
            address: "synthetic",
            rentalMode: "ROOMS",
          },
        });
        const policy = await tx.allocationPolicyVersion.create({
          data: {
            propertyId: property.id,
            policyKey: marker,
            versionNumber: 1,
            utilityType: "ELECTRICITY",
            allocationMethod: "PERSON_DAYS",
            effectiveStart: new Date("2026-09-01T00:00:00Z"),
            terms: {
              scope: "PROPERTY_PERSON_DAYS",
              tenantPrepayments: "NONE",
            },
          },
        });
        const people = [];
        for (let i = 0; i < 3; i++) {
          const tenant = await tx.user.create({
            data: {
              email: marker + i + "@example.invalid",
              name: "test tenant",
              role: "TENANT",
            },
          });
          const application = await tx.rentalApplication.create({
            data: {
              propertyId: property.id,
              tenantId: tenant.id,
              status: "APPROVED",
              requestedStartDate: new Date("2026-09-01T00:00:00Z"),
            },
          });
          const tenancy = await tx.tenancy.create({
            data: {
              propertyId: property.id,
              tenantId: tenant.id,
              applicationId: application.id,
              billingStartDate: new Date(
                i === 2 ? "2026-09-16T00:00:00Z" : "2026-09-01T00:00:00Z",
              ),
            },
          });
          for (const userId of [owner.id, tenant.id])
            await tx.ruleConfirmation.create({
              data: {
                policyVersionId: policy.id,
                tenancyId: tenancy.id,
                userId,
              },
            });
          people.push(tenant);
        }
        const source = await tx.sourceDocument.create({
          data: {
            landlordId: owner.id,
            fileUrl: "private://test",
            fileHash: marker,
            isSynthetic: false,
          },
        });
        const bill = await tx.bill.create({
          data: {
            propertyId: property.id,
            sourceDocumentId: source.id,
            utilityType: "ELECTRICITY",
            processing: { create: { status: "READY" } },
          },
        });
        const version = await tx.billVersion.create({
          data: {
            billId: bill.id,
            versionNumber: 1,
            currency: "EUR",
            extractedLineItems: synthetic(),
          },
        });
        await expect(ownedBill(bill.id, people[0].id)).rejects.toMatchObject({
          status: 404,
        });
        const draft = await generateDraft(bill.id, version.id);
        let rows = await tx.charge.findMany({
          where: { billVersionId: version.id },
        });
        expect(
          people.map((p) =>
            rows.find((c) => c.tenantId === p.id)?.actualShare.toFixed(2),
          ),
        ).toEqual(["72.00", "72.00", "36.00"]);
        await expect(
          publish(
            bill.id,
            owner.id,
            marker + "-missing",
            draft.fingerprint,
            marker,
          ),
        ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
        expect(
          await tx.billVersion.findUniqueOrThrow({
            where: { id: version.id },
          }),
        ).toMatchObject({
          status: "READY",
          publicationKey: null,
          publishedAt: null,
        });
        expect(
          await tx.charge.findMany({ where: { billVersionId: version.id } }),
        ).toEqual(rows);
        await expect(
          ownedCharge(rows[0].id, rows[0].tenantId),
        ).rejects.toMatchObject({ status: 404 });
        await tx.allocationPolicyVersion.update({
          where: { id: policy.id },
          data: {
            terms: {
              scope: "PROPERTY_PERSON_DAYS",
              tenantPrepayments: "NONE",
              changed: true,
            },
          },
        });
        await expect(
          publish(bill.id, owner.id, version.id, draft.fingerprint, marker),
        ).rejects.toMatchObject({ code: "STALE_INPUTS" });
        const refreshed = await generateDraft(bill.id, version.id);
        await publish(
          bill.id,
          owner.id,
          version.id,
          refreshed.fingerprint,
          marker,
        );
        await publish(
          bill.id,
          owner.id,
          version.id,
          refreshed.fingerprint,
          marker,
        );
        const publishedVersion = await tx.billVersion.findUniqueOrThrow({
          where: { id: version.id },
        });
        for (const [fingerprint, key] of [
          [refreshed.fingerprint, marker + "-different"],
          ["different-fingerprint", marker],
        ]) {
          await expect(
            publish(bill.id, owner.id, version.id, fingerprint, key),
          ).rejects.toMatchObject({ code: "ALREADY_PUBLISHED" });
        }
        expect(
          await tx.billVersion.findUniqueOrThrow({
            where: { id: version.id },
          }),
        ).toEqual(publishedVersion);
        rows = await tx.charge.findMany({
          where: { billVersionId: version.id },
        });
        expect(rows).toHaveLength(3);
        await expect(
          ownedCharge(
            rows[0].id,
            people.find((p) => p.id !== rows[0].tenantId)!.id,
          ),
        ).rejects.toMatchObject({ status: 404 });
        await ownedCharge(rows[0].id, rows[0].tenantId);
        await tx.charge.update({
          where: { id: rows[0].id },
          data: { confirmedAt: new Date() },
        });
        await tx.$executeRawUnsafe("SAVEPOINT frozen");
        await expect(
          tx.charge.update({
            where: { id: rows[0].id },
            data: { netAmountDue: "0.01" },
          }),
        ).rejects.toThrow();
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT frozen");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT frozen");
        await tx.$executeRawUnsafe("SAVEPOINT version_frozen");
        await expect(
          tx.billVersion.update({
            where: { id: version.id },
            data: { allocationBase: "0.01" },
          }),
        ).rejects.toThrow();
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT version_frozen");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT version_frozen");
        const statementSource = await tx.sourceDocument.create({
          data: {
            landlordId: owner.id,
            fileUrl: "private://statement",
            fileHash: marker + "statement",
            isSynthetic: false,
          },
        });
        const extractedStatement = utilityStatement();
        extractedStatement.issues = [
          "Kein Abrechnungszeitraum sichtbar",
          "Strom: Bruttobetrag widerspricht Netto und Steuer",
        ];
        const originalIssues = reconcile(extractedStatement);
        const statementBill = await tx.bill.create({
          data: {
            propertyId: property.id,
            sourceDocumentId: statementSource.id,
            utilityType: "ELECTRICITY",
            processing: {
              create: { status: "FAILED", errorCode: "PROCESSING_FAILED" },
            },
          },
        });
        const statementVersion = await tx.billVersion.create({
          data: {
            billId: statementBill.id,
            versionNumber: 1,
            currency: "EUR",
            extractedLineItems: extractedStatement,
            reconciliationIssues: originalIssues,
          },
        });
        await expect(
          calculation(tx, statementBill.id, statementVersion.id),
        ).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
        const review = {
          versionId: statementVersion.id,
          start: "2026-09-01",
          end: "2026-10-01",
          note: "Supplemental demo basis: prior supplier advances paid; detail rows remain reference evidence.",
          settlement: {
            supplierAdvancePaidPreviously: true as const,
            lineItemsReferenceOnly: true as const,
            acknowledgedIssues: originalIssues,
          },
        };
        await expect(
          reviewDates(statementBill.id, owner.id, {
            ...review,
            settlement: { ...review.settlement, acknowledgedIssues: [] },
          }),
        ).rejects.toMatchObject({ code: "REVIEW_ISSUES_CHANGED" });
        const unapproved = await reviewDates(statementBill.id, owner.id, {
          ...review,
          settlement: undefined,
        });
        expect(unapproved.status).toBe("NEEDS_REVIEW");
        await expect(
          calculation(tx, statementBill.id, unapproved.versionId),
        ).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
        const current = await tx.billVersion.findUniqueOrThrow({
          where: { id: unapproved.versionId },
        });
        const reviewed = await reviewDates(statementBill.id, owner.id, {
          ...review,
          versionId: current.id,
          settlement: {
            ...review.settlement,
            acknowledgedIssues: current.reconciliationIssues as string[],
          },
        });
        expect(reviewed.status).toBe("READY");
        const monthlyVersion = await tx.billVersion.findUniqueOrThrow({
          where: { id: reviewed.versionId },
        });
        expect(monthlyVersion.reconciliationIssues).toEqual([]);
        expect(monthlyVersion.extractedLineItems).toMatchObject({
          issues: extractedStatement.issues,
        });
        expect(monthlyVersion.snapshot).toMatchObject({
          reconciliation: {
            ignoredIssues: expect.arrayContaining(extractedStatement.issues),
          },
        });
        expect(
          await tx.processingJob.findUnique({
            where: { billId: statementBill.id },
          }),
        ).toMatchObject({
          status: "READY",
          errorCode: null,
          leaseToken: null,
        });
        const unchangedPolicy =
          await tx.allocationPolicyVersion.findUniqueOrThrow({
            where: { id: policy.id },
          });
        expect(unchangedPolicy.terms).not.toHaveProperty(
          "supplierAdvanceHandling",
        );
        const monthly = await calculation(
          tx,
          statementBill.id,
          monthlyVersion.id,
        );
        expect(monthly.allocationAmount).toBe("150.52");
        expect(monthly.supplierAdvancePaidPreviously).toBe(true);
        expect(monthly.result.total).toBe("150.52");
        expect(monthly.result.charges.map((row) => row.actualShare)).toEqual([
          "60.21",
          "60.21",
          "30.10",
        ]);
        const monthlyRows = await tx.charge.findMany({
          where: { billVersionId: monthlyVersion.id },
        });
        expect(
          monthlyRows.every((c) =>
            c.explanationEN?.includes("Supplemental demo agreement"),
          ),
        ).toBe(true);
        const retained = z
          .object({
            reconciliation: z.object({ ignoredIssues: z.array(z.string()) }),
          })
          .parse(monthlyVersion.snapshot);
        const rereviewed = await reviewDates(statementBill.id, owner.id, {
          ...review,
          versionId: monthlyVersion.id,
          note: "Corrected demo source note; same dates and settlement basis.",
          settlement: {
            ...review.settlement,
            acknowledgedIssues: retained.reconciliation.ignoredIssues,
          },
        });
        expect(rereviewed.status).toBe("READY");
        const repeated = await calculation(
          tx,
          statementBill.id,
          rereviewed.versionId,
        );
        expect(repeated.result.charges.map((c) => c.actualShare)).toEqual([
          "60.21",
          "60.21",
          "30.10",
        ]);
        // Even acknowledged source warnings cannot waive inconsistent settlement arithmetic.
        const mismatched = { ...extractedStatement, amountDue: "150.51" };
        const mismatchedVersion = await tx.billVersion.create({
          data: {
            billId: statementBill.id,
            versionNumber: 5,
            currency: "EUR",
            extractedLineItems: mismatched,
            reconciliationIssues: reconcile(mismatched),
          },
        });
        const rejectedSettlement = await reviewDates(
          statementBill.id,
          owner.id,
          {
            ...review,
            versionId: mismatchedVersion.id,
            settlement: {
              ...review.settlement,
              acknowledgedIssues: reconcile(mismatched),
            },
          },
        );
        expect(rejectedSettlement.status).toBe("NEEDS_REVIEW");
        expect(
          await tx.charge.count({
            where: { billVersionId: rejectedSettlement.versionId },
          }),
        ).toBe(0);
        const draftCharge = await tx.charge.create({
          data: {
            billVersionId: statementVersion.id,
            tenancyId: rows[0].tenancyId,
            tenantId: rows[0].tenantId,
            daysOccupied: 30,
            shareBeforeRounding: "1.00",
            actualShare: "1.00",
            netAmountDue: "1.00",
            currency: "EUR",
            calculationDetails: { synthetic: true },
          },
        });
        await tx.$executeRawUnsafe("SAVEPOINT move_frozen");
        await expect(
          tx.charge.update({
            where: { id: draftCharge.id },
            data: { billVersionId: version.id },
          }),
        ).rejects.toThrow("Cannot attach");
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT move_frozen");
        const contribution = await tx.contribution.create({
          data: {
            billId: bill.id,
            payerId: rows[0].tenantId,
            kind: "TENANT_PREPAYMENT",
            amount: "1.00",
            currency: "EUR",
            evidenceType: "synthetic",
            evidenceReference: marker,
          },
        });
        await tx.$executeRawUnsafe("SAVEPOINT credit_frozen");
        await expect(
          tx.chargeCredit.create({
            data: {
              chargeId: rows[0].id,
              contributionId: contribution.id,
              amount: "1.00",
            },
          }),
        ).rejects.toThrow("Published credits");
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT credit_frozen");
        const attempt = await tx.paymentAttempt.create({
          data: {
            chargeId: rows[0].id,
            amount: rows[0].netAmountDue,
            currency: "EUR",
            idempotencyKey: marker,
            payeeMerchantId: "synthetic",
          },
        });
        expect(attempt.captureRequestKey).toBeTruthy();
        await tx.$executeRawUnsafe("SAVEPOINT duplicate_pending");
        await expect(
          tx.paymentAttempt.create({
            data: {
              chargeId: rows[0].id,
              amount: rows[0].netAmountDue,
              currency: "EUR",
              idempotencyKey: marker + "other",
              payeeMerchantId: "synthetic",
            },
          }),
        ).rejects.toThrow();
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT duplicate_pending");
        throw rollback;
      },
      { timeout: 300000, maxWait: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    expect(
      await db.user.count({ where: { email: { contains: marker } } }),
    ).toBe(0);
    await db.$disconnect();
  }
}, 330000);
