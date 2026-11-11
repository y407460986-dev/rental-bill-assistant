import { requireTenant } from "@/lib/auth/server";
import { ownedCharge } from "@/lib/billing/access";
import { api } from "@/lib/http";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireTenant();
    const { id } = await ctx.params;
    const charge = await ownedCharge(id, user.id);
    return {
      id: charge.id,
      currency: charge.currency,
      daysOccupied: charge.daysOccupied,
      actualShare: charge.actualShare,
      netAmountDue: charge.netAmountDue,
      creditApplied: charge.actualShare.minus(charge.netAmountDue).toFixed(2),
      confirmedAt: charge.confirmedAt,
      explanationCN: charge.explanationCN,
      explanationEN: charge.explanationEN,
      billId: charge.billVersion.billId,
      servicePeriodStart: charge.billVersion.servicePeriodStart,
      servicePeriodEnd: charge.billVersion.servicePeriodEnd,
      synthetic: charge.billVersion.bill.sourceDocument.isSynthetic,
      paid: charge.paymentAttempts.some((a) => a.status === "COMPLETED"),
    };
  });
}
