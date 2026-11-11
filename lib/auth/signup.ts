import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { AppError, env } from "@/lib/http";

export const SignupInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email().max(200),
    password: z.string().min(8).max(200),
    role: z.enum(["TENANT", "LANDLORD"]),
  })
  .strict();
export type SignupInput = z.infer<typeof SignupInput>;

function adminAuth() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Normal sign-up: the visitor picks tenant or landlord. A landlord account can
// only ever act on the properties it creates itself; ownership checks stay in
// the server services, so self-signup does not grant access to demo data.
export async function createAccount(input: SignupInput) {
  const db = getDb();
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "EMAIL_TAKEN");
  const admin = adminAuth();
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    const taken = /already|registered|exists/i.test(
      created.error?.message ?? "",
    );
    throw new AppError(
      taken ? 409 : 503,
      taken ? "EMAIL_TAKEN" : "SIGNUP_FAILED",
    );
  }
  const authUser = created.data.user;
  try {
    return await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        authUserId: authUser.id,
      },
    });
  } catch (error) {
    // Do not leave an Auth account with no application row behind: login would
    // fail with ACCOUNT_NOT_LINKED.
    await admin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    const code = (error as { code?: string }).code;
    throw new AppError(409, code === "P2002" ? "EMAIL_TAKEN" : "SIGNUP_FAILED");
  }
}
