import { api, sameOrigin } from "@/lib/http";
import { requireTenant } from "@/lib/auth/server";
import { applyForListing } from "@/lib/rental/workflow";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(r);
    const user = await requireTenant();
    return applyForListing(user.id, (await params).id, await r.json());
  });
}
