import { z } from "zod";
import { api, sameOrigin, must } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { decideApplication } from "@/lib/rental/workflow";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(r);
    const user = await requireUser();
    const input = z
      .object({ decision: z.enum(["approve", "reject", "cancel"]) })
      .strict()
      .parse(await r.json());
    must(
      input.decision === "cancel"
        ? user.role === "TENANT"
        : user.role === "LANDLORD",
      "FORBIDDEN",
      403,
    );
    return decideApplication(user.id, (await params).id, input.decision);
  });
}
