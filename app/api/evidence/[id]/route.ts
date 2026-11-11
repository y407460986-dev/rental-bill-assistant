import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readEvidence } from "@/lib/storage/server";
import { must, AppError } from "@/lib/http";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const bill = await getDb().bill.findFirst({
      where: {
        id,
        OR: [
          { property: { landlordId: user.id } },
          {
            versions: {
              some: {
                status: "PUBLISHED",
                charges: { some: { tenantId: user.id } },
              },
            },
          },
        ],
      },
      include: { sourceDocument: true },
    });
    must(bill?.sourceDocument.storagePath, "NOT_FOUND", 404);
    const file = await readEvidence(bill.sourceDocument.storagePath);
    return new Response(file, {
      headers: {
        "Content-Type": file.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof AppError ? error.code : "EVIDENCE_UNAVAILABLE",
      },
      { status: error instanceof AppError ? error.status : 503 },
    );
  }
}
