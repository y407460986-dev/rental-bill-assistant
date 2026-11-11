import { requireTenant } from "@/lib/auth/server";
import { ownedCharge } from "@/lib/billing/access";
import { createPayment, capturePayment } from "@/lib/paypal/payments";
import { getDb } from "@/lib/db";
import { api, sameOrigin, must } from "@/lib/http";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    const user = await requireTenant();
    const { id, action } = await ctx.params;
    if (action === "payment") return createPayment(id, user.id);
    if (action === "capture") return capturePayment(id, user.id, true);
    if (action === "confirm") {
      const charge = await ownedCharge(id, user.id);
      if (!charge.confirmedAt)
        await getDb().charge.updateMany({
          where: { id, confirmedAt: null },
          data: { confirmedAt: new Date() },
        });
      return { ok: true };
    }
    must(false, "NOT_FOUND", 404);
  });
}
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  return api(async () => {
    const user = await requireTenant();
    const { id, action } = await ctx.params;
    must(action === "payment", "NOT_FOUND", 404);
    return capturePayment(id, user.id, false);
  });
}
