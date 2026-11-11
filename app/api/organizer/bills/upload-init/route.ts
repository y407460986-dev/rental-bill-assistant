import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireLandlord } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { api, must, sameOrigin } from "@/lib/http";
import { signedUpload, bucket } from "@/lib/storage/server";

// Step 1 of 2: issue a signed Supabase Storage upload target. The actual file
// bytes never reach this Vercel function, so the 4.5 MB platform body-size
// limit does not constrain upload size. Validation of the real bytes happens
// in upload-finalize after the browser uploads directly to Storage.
const input = z
  .object({
    propertyId: z.string().min(1),
    contentType: z.enum(["image/png", "image/jpeg"]),
  })
  .strict();

export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const user = await requireLandlord();
    const body = input.parse(await request.json());
    const property = await getDb().property.findFirst({
      where: { id: body.propertyId, landlordId: user.id },
    });
    must(property, "NOT_FOUND", 404);
    const ext = body.contentType === "image/png" ? ".png" : ".jpg";
    const path = user.id + "/" + randomUUID() + ext;
    const signed = await signedUpload(path);
    return { path: signed.path, token: signed.token, bucket: bucket() };
  });
}
