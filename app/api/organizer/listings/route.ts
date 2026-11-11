import { api, sameOrigin } from "@/lib/http";
import { requireLandlord } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  createListing,
  listingEditBlockReason,
  listingEditInclude,
} from "@/lib/rental/workflow";
export async function GET() {
  return api(async () => {
    const user = await requireLandlord();
    const listings = await getDb().property.findMany({
      where: { landlordId: user.id },
      include: listingEditInclude,
      orderBy: { createdAt: "desc" },
    });
    return listings.map(({ policies, ...property }) => ({
      ...property,
      editBlockReason: listingEditBlockReason({ ...property, policies }),
    }));
  });
}
export async function POST(r: Request) {
  return api(async () => {
    sameOrigin(r);
    const user = await requireLandlord();
    return createListing(user.id, await r.json());
  });
}
