import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireLandlord } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { api, must, sameOrigin } from "@/lib/http";
import { readUploaded, storage, bucket } from "@/lib/storage/server";

// Step 2 of 2: the browser has already pushed the file directly to Supabase
// Storage using the token from upload-init. This route reads the bytes back
// server-side to run the same validation the old single-request upload did
// (size cap, JPEG/PNG magic-byte check, SHA256 dedup) before creating the
// Bill record. The object is removed if any check fails.
const input = z
  .object({
    path: z.string().min(1),
    propertyId: z.string().min(1),
  })
  .strict();

export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await requireLandlord();
    const body = input.parse(await request.json());
    must(body.path.startsWith(user.id + "/"), "FORBIDDEN", 403);
    const property = await getDb().property.findFirst({
      where: { id: body.propertyId, landlordId: user.id },
    });
    must(property, "NOT_FOUND", 404);
    const store = storage().from(bucket());
    const buffer = await readUploaded(body.path);
    must(
      buffer.length > 0 && buffer.length <= 10 * 1024 * 1024,
      "INVALID_FILE",
      400,
    );
    const png = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (!png && !jpeg) {
      await store.remove([body.path]);
      must(false, "JPEG_OR_PNG_REQUIRED", 400);
    }
    const hash = createHash("sha256").update(buffer).digest("hex");
    const old = await getDb().sourceDocument.findUnique({
      where: { landlordId_fileHash: { landlordId: user.id, fileHash: hash } },
      include: { bill: true },
    });
    if (old?.bill) {
      if (old.storagePath !== body.path) await store.remove([body.path]);
      must(old.bill.propertyId === body.propertyId, "DUPLICATE_OTHER_PROPERTY");
      return { billId: old.bill.id, duplicate: true };
    }
    try {
      const bill = await getDb().bill.create({
        data: {
          property: { connect: { id: body.propertyId } },
          utilityType: "ELECTRICITY",
          sourceDocument: {
            create: {
              landlordId: user.id,
              fileHash: hash,
              fileUrl: "private://" + body.path,
              storagePath: body.path,
            },
          },
          processing: { create: {} },
        },
      });
      return { billId: bill.id, duplicate: false };
    } catch (error) {
      // A replay or a concurrent finalize may already own this object. Never
      // delete durable evidence while cleaning up a failed create attempt.
      let existing;
      try {
        existing = await getDb().sourceDocument.findUnique({
          where: {
            landlordId_fileHash: { landlordId: user.id, fileHash: hash },
          },
          include: { bill: true },
        });
        // No committed winner means another finalize may still commit this
        // path. Only a different, durable winner proves this upload redundant.
        if (existing?.bill && existing.storagePath !== body.path) {
          const referenced = await getDb().sourceDocument.findFirst({
            where: { storagePath: body.path },
            select: { id: true },
          });
          if (!referenced) await store.remove([body.path]);
        }
      } catch {
        // If ownership cannot be checked, retain the object and original error.
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        if (existing?.bill) {
          must(
            existing.bill.propertyId === body.propertyId,
            "DUPLICATE_OTHER_PROPERTY",
          );
          return { billId: existing.bill.id, duplicate: true };
        }
      }
      throw error;
    }
  });
}
