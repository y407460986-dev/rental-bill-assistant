import { getDb } from "@/lib/db";
import { z } from "zod";
import { requireLandlord } from "@/lib/auth/server";
import { ownedBill } from "@/lib/billing/access";
import {
  processBill,
  publish,
  generateDraft,
  reviewDates,
} from "@/lib/billing/workflow";
import { api, sameOrigin, must } from "@/lib/http";
export const maxDuration = 120;
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  const processingDeadline = Date.now() + 105000;
  return api(async () => {
    sameOrigin(request);
    const user = await requireLandlord();
    const { id, action } = await ctx.params;
    if (action === "review") {
      const input = z
        .object({
          versionId: z.string().min(1),
          start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          note: z.string().min(5).max(1000),
          settlement: z
            .object({
              supplierAdvancePaidPreviously: z.literal(true),
              lineItemsReferenceOnly: z.literal(true),
              acknowledgedIssues: z.array(z.string()),
            })
            .strict()
            .optional(),
        })
        .strict()
        .parse(await request.json());
      return reviewDates(id, user.id, input);
    }
    if (action === "process")
      return processBill(id, user.id, processingDeadline);
    if (action === "publish") {
      const input = z
        .object({
          versionId: z.string().min(1),
          fingerprint: z.string().length(64),
          key: z.string().min(1).max(100),
        })
        .strict()
        .parse(await request.json());
      return publish(
        id,
        user.id,
        input.versionId,
        input.fingerprint,
        input.key,
      );
    }
    if (action === "generate") {
      const bill = await ownedBill(id, user.id);
      must(bill.versions[0], "EXTRACTION_REQUIRED");
      must(
        !bill.processing?.leaseUntil || bill.processing.leaseUntil < new Date(),
        "PROCESSING_IN_PROGRESS",
      );
      const result = await generateDraft(id, bill.versions[0].id);
      await getDb().processingJob.update({
        where: { billId: id },
        data: {
          status: "READY",
          leaseToken: null,
          leaseUntil: null,
          errorCode: null,
        },
      });
      return result;
    }
    must(false, "NOT_FOUND", 404);
  });
}
