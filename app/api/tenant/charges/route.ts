import { requireTenant } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { api } from "@/lib/http";
export async function GET() {
  return api(async () => {
    const user = await requireTenant();
    return getDb().charge.findMany({
      where: { tenantId: user.id, billVersion: { status: "PUBLISHED" } },
      select: {
        id: true,
        daysOccupied: true,
        netAmountDue: true,
        currency: true,
        confirmedAt: true,
        paymentAttempts: { select: { status: true } },
        billVersion: {
          select: { servicePeriodStart: true, servicePeriodEnd: true },
        },
      },
    });
  });
}
