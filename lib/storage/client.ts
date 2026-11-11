import { createClient } from "@supabase/supabase-js";

// Browser-side helper. Uploads go directly to Supabase Storage using a
// short-lived signed token issued by /api/organizer/bills/upload-init, so the
// file body never passes through our Vercel serverless function and is not
// subject to the platform's 4.5 MB request body limit.
export async function uploadToSignedUrl(
  path: string,
  token: string,
  bucket: string,
  file: File,
  contentType: string,
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType });
  if (error) throw new Error(error.message);
}
