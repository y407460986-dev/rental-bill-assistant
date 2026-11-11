import { requireLandlord } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { api } from "@/lib/http";
export async function GET() {
  return api(async () => {
    const user = await requireLandlord();
    return getDb().property.findMany({
      where: { landlordId: user.id, isDemo: false, city: { not: null } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });
  });
}
