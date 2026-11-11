import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { env, must } from "@/lib/http";
export async function authClient() {
  const jar = await cookies();
  return createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          for (const { name, value, options } of values) {
            try {
              jar.set(name, value, options);
            } catch {
              /* Server components cannot refresh cookies; API requests can. */
            }
          }
        },
      },
    },
  );
}
export async function requireUser(role?: "LANDLORD" | "TENANT") {
  const auth = await authClient();
  const { data, error } = await auth.auth.getUser();
  must(!error && data.user, "LOGIN_REQUIRED", 401);
  const user = await getDb().user.findUnique({
    where: { authUserId: data.user.id },
  });
  must(user, "ACCOUNT_NOT_LINKED", 403);
  must(!role || user.role === role, "FORBIDDEN", 403);
  return user;
}
export const requireLandlord = () => requireUser("LANDLORD");
export const requireTenant = () => requireUser("TENANT");
