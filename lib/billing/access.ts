import "server-only";
import { getDb } from "@/lib/db";
import { must } from "@/lib/http";
export async function ownedBill(id: string, landlordId: string) {
  const bill = await getDb().bill.findFirst({
    where: { id, property: { landlordId } },
    include: {
      sourceDocument: true,
      property: true,
      processing: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          charges: {
            include: {
              tenancy: { select: { tenant: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  must(bill, "NOT_FOUND", 404);
  return bill;
}
export async function ownedCharge(id: string, tenantId: string) {
  const charge = await getDb().charge.findFirst({
    where: { id, tenantId, billVersion: { status: "PUBLISHED" } },
    include: {
      paymentAttempts: true,
      billVersion: {
        include: {
          bill: { include: { sourceDocument: true, property: true } },
        },
      },
    },
  });
  must(charge, "NOT_FOUND", 404);
  return charge;
}
