import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/db.ts";

const db = getDb();
const marker = randomUUID();
const rollback = new Error("Intentional verification rollback");
const date = (value) => new Date(value + "T00:00:00.000Z");

try {
  await db.$transaction(
    async (tx) => {
      const owner = await tx.user.create({
        data: {
          email: marker + "@example.invalid",
          name: "Database verification",
          role: "LANDLORD",
        },
      });
      const tenant = await tx.user.create({
        data: {
          email: marker + "-tenant@example.invalid",
          name: "Database verification",
          role: "TENANT",
        },
      });
      const property = await tx.property.create({
        data: {
          landlordId: owner.id,
          title: "Temporary verification",
          address: "Synthetic",
          rentalMode: "ROOMS",
          advertisedRent: "1000.10",
        },
      });
      const room = await tx.room.create({
        data: { propertyId: property.id, name: "Check room", capacity: 2 },
      });
      const application = await tx.rentalApplication.create({
        data: {
          propertyId: property.id,
          roomId: room.id,
          tenantId: tenant.id,
          requestedStartDate: date("2026-09-16"),
          status: "APPROVED",
        },
      });
      const tenancy = await tx.tenancy.create({
        data: {
          applicationId: application.id,
          propertyId: property.id,
          roomId: room.id,
          tenantId: tenant.id,
          billingStartDate: date("2026-09-16"),
          billingEndDate: date("2026-10-01"),
        },
      });
      const policy = await tx.allocationPolicyVersion.create({
        data: {
          propertyId: property.id,
          policyKey: marker,
          versionNumber: 1,
          utilityType: "ELECTRICITY",
          allocationMethod: "PERSON_DAYS",
          effectiveStart: date("2026-09-01"),
          terms: { synthetic: true },
        },
      });
      await tx.ruleConfirmation.create({
        data: {
          policyVersionId: policy.id,
          tenancyId: tenancy.id,
          userId: tenant.id,
        },
      });
      const source = await tx.sourceDocument.create({
        data: {
          landlordId: owner.id,
          fileUrl: "https://example.invalid/check",
          fileHash: marker,
        },
      });
      const bill = await tx.bill.create({
        data: {
          propertyId: property.id,
          sourceDocumentId: source.id,
          utilityType: "ELECTRICITY",
        },
      });
      const version = await tx.billVersion.create({
        data: {
          billId: bill.id,
          versionNumber: 1,
          currency: "EUR",
          allocationBase: "36.01",
          servicePeriodStart: date("2026-09-01"),
          servicePeriodEnd: date("2026-10-01"),
        },
      });
      const contribution = await tx.contribution.create({
        data: {
          billId: bill.id,
          payerId: tenant.id,
          kind: "TENANT_PREPAYMENT",
          amount: "10.00",
          currency: "EUR",
          evidenceType: "synthetic",
          evidenceReference: marker,
        },
      });
      const charge = await tx.charge.create({
        data: {
          billVersionId: version.id,
          tenancyId: tenancy.id,
          tenantId: tenant.id,
          daysOccupied: 15,
          shareBeforeRounding: "36.01",
          actualShare: "36.01",
          netAmountDue: "26.01",
          currency: "EUR",
          calculationDetails: { synthetic: true },
        },
      });
      await tx.chargeCredit.create({
        data: {
          chargeId: charge.id,
          contributionId: contribution.id,
          amount: "10.00",
        },
      });
      await tx.paymentAttempt.create({
        data: {
          chargeId: charge.id,
          idempotencyKey: marker,
          amount: "26.01",
          currency: "EUR",
          payeeMerchantId: "synthetic-not-a-payment",
        },
      });
      const loaded = await tx.charge.findUniqueOrThrow({
        where: { id: charge.id },
        include: { credits: true, tenancy: true, paymentAttempts: true },
      });
      assert.equal(loaded.netAmountDue.toFixed(2), "26.01");
      assert.equal(loaded.credits[0].amount.toFixed(2), "10.00");
      assert.equal(
        loaded.tenancy.billingStartDate.toISOString().slice(0, 10),
        "2026-09-16",
      );
      assert.equal(loaded.paymentAttempts.length, 1);
      console.log(
        "PASS: related writes/reads across 14 models, exact decimals and calendar dates",
      );

      async function rejected(label, expected, operation) {
        await tx.$executeRawUnsafe("SAVEPOINT invalid_input");
        let error;
        try {
          await operation();
        } catch (caught) {
          error = caught;
        }
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_input");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT invalid_input");
        assert.ok(error, label + " must be rejected");
        assert.ok(
          String(error.message).includes(expected),
          label + " failed for an unexpected reason",
        );
        console.log("PASS: " + label);
      }
      await rejected("zero capacity", "Room_capacity_positive", () =>
        tx.room.update({ where: { id: room.id }, data: { capacity: 0 } }),
      );
      await rejected("reversed tenancy dates", "Tenancy_dates_ordered", () =>
        tx.tenancy.update({
          where: { id: tenancy.id },
          data: { billingEndDate: date("2026-09-15") },
        }),
      );
      await rejected("negative charge", "Charge_amounts_valid", () =>
        tx.charge.update({
          where: { id: charge.id },
          data: { netAmountDue: "-0.01" },
        }),
      );
      await rejected(
        "wrong charge tenant",
        "Charge_tenancyId_tenantId_fkey",
        () =>
          tx.charge.update({
            where: { id: charge.id },
            data: { tenantId: owner.id },
          }),
      );
      await rejected("duplicate payment key", "idempotencyKey", () =>
        tx.paymentAttempt.create({
          data: {
            chargeId: charge.id,
            idempotencyKey: marker,
            amount: "26.01",
            currency: "EUR",
            payeeMerchantId: "synthetic",
          },
        }),
      );

      const tables = await tx.$queryRawUnsafe(
        "SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations'",
      );
      assert.equal(tables.length, 15);
      assert.ok(tables.every((table) => table.relrowsecurity));
      for (const role of ["anon", "authenticated"]) {
        await tx.$executeRawUnsafe("SAVEPOINT role_check");
        try {
          await tx.$executeRawUnsafe("SET LOCAL ROLE " + role);
          const rows = await tx.$queryRawUnsafe(
            'SELECT id FROM "User" WHERE id = $1',
            owner.id,
          );
          assert.equal(
            rows.length,
            0,
            role + " must not see application records",
          );
        } catch (error) {
          // Both no SELECT grant and RLS filtering are valid denials.
          if (error.code !== "P2010" || error.meta?.code !== "42501")
            throw error;
        } finally {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT role_check");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT role_check");
        }
      }
      console.log(
        "PASS: RLS enabled on 15 tables; anon/authenticated reads blocked",
      );
      throw rollback;
    },
    { maxWait: 15000, timeout: 60000 },
  );
} catch (error) {
  if (error !== rollback) {
    // Avoid printing provider error messages which may contain credentials or data.
    console.error(
      "Database verification failed:",
      error.code || error.errorCode || error.name,
    );
    if (error.code === "ERR_ASSERTION") console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  try {
    assert.equal(
      await db.user.count({
        where: {
          email: {
            in: [
              marker + "@example.invalid",
              marker + "-tenant@example.invalid",
            ],
          },
        },
      }),
      0,
    );
    console.log("PASS: verification records rolled back");
  } catch {
    console.error("Rollback verification failed");
    process.exitCode = 1;
  }
  await db.$disconnect();
}
