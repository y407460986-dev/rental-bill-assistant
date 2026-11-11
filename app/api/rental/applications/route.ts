import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
export async function GET() {
  return api(async () => {
    const user = await requireUser();
    return getDb().rentalApplication.findMany({
      where:
        user.role === "LANDLORD"
          ? { property: { landlordId: user.id } }
          : { tenantId: user.id },
      select: {
        id: true,
        status: true,
        requestedStartDate: true,
        requestedEndDate: true,
        agreement: true,
        createdAt: true,
        tenant: { select: { name: true } },
        property: {
          select: { id: true, title: true, rentalMode: true, isDemo: true },
        },
        room: { select: { name: true, capacity: true } },
        tenancy: {
          select: {
            id: true,
            billingStartDate: true,
            billingEndDate: true,
            confirmations: { select: { userId: true, policyVersionId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });
}
