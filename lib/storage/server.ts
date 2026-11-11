import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, must } from "@/lib/http";
export const bucket = () =>
  process.env.SUPABASE_STORAGE_BUCKET || "bill-evidence";
export function storage() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage;
}
export async function readEvidence(path: string): Promise<Blob> {
  const result = await storage().from(bucket()).download(path);
  must(!result.error && result.data, "EVIDENCE_UNAVAILABLE", 503);
  return result.data;
}
// Issues a short-lived signed upload token so the browser can push the file
// directly to Supabase Storage, bypassing the Vercel serverless function
// body size limit (4.5 MB) that would otherwise block larger evidence files.
export async function signedUpload(
  path: string,
): Promise<{ path: string; token: string }> {
  const result = await storage().from(bucket()).createSignedUploadUrl(path);
  must(!result.error && result.data, "SIGNED_UPLOAD_FAILED", 503);
  return { path: result.data.path, token: result.data.token };
}
// Reads back an uploaded object so its bytes can be validated server-side
// (magic-byte check, size cap, hash dedup) after a direct-to-storage upload.
export async function readUploaded(path: string): Promise<Buffer> {
  const result = await storage().from(bucket()).download(path);
  must(!result.error && result.data, "UPLOAD_UNAVAILABLE", 503);
  return Buffer.from(await result.data.arrayBuffer());
}
