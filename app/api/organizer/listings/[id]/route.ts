import { z } from "zod";
import { api, sameOrigin } from "@/lib/http";
import { requireLandlord } from "@/lib/auth/server";
import { setPublication, updateListing } from "@/lib/rental/workflow";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(r);
    const user = await requireLandlord();
    const input = z
      .object({ published: z.boolean(), consent: z.literal(true) })
      .strict()
      .parse(await r.json());
    return setPublication(user.id, (await params).id, input.published);
  });
}

export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(r);
    const user = await requireLandlord();
    return updateListing(user.id, (await params).id, await r.json());
  });
}
