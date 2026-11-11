import { createClient } from "@supabase/supabase-js";
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } =
  process.env;
if (!url || !key) {
  console.error("Configure Supabase URL and service role key first");
  process.exit(1);
}
const storage = createClient(url, key).storage;
const name = process.env.SUPABASE_STORAGE_BUCKET || "bill-evidence";
const { data, error } = await storage.getBucket(name);
if (data?.public)
  throw new Error(
    "Existing bucket is public; refusing to change it automatically",
  );
// Storage can return HTTP 400 while its service error code is 404.
if (error && error.statusCode !== "404")
  throw new Error("Cannot inspect storage bucket");
if (!data) {
  const result = await storage.createBucket(name, {
    public: false,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  });
  if (result.error) throw new Error("Cannot create private bucket");
}
console.log("Private evidence bucket ready");
