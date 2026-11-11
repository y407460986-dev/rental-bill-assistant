import { requireLandlord } from "@/lib/auth/server";
import { ownedBill } from "@/lib/billing/access";
import { api } from "@/lib/http";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireLandlord();
    const { id } = await ctx.params;
    return ownedBill(id, user.id);
  });
}
