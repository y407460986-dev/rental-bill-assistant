import { z } from "zod";
import { authClient, requireUser } from "@/lib/auth/server";
import { createAccount, SignupInput } from "@/lib/auth/signup";
import { api, sameOrigin, must } from "@/lib/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    const { action } = await context.params;
    const auth = await authClient();
    if (action === "logout") {
      const { error } = await auth.auth.signOut({ scope: "local" });
      must(!error, "LOGOUT_FAILED", 503);
      return { ok: true };
    }
    if (action === "signup") {
      const input = SignupInput.parse(await request.json());
      await createAccount(input);
      const { error } = await auth.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      must(!error, "SIGNUP_SIGNIN_FAILED", 503);
      const user = await requireUser();
      return { id: user.id, name: user.name, role: user.role };
    }
    must(action === "login", "NOT_FOUND", 404);
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .strict()
      .parse(await request.json());
    const { error } = await auth.auth.signInWithPassword(input);
    must(!error, "INVALID_CREDENTIALS", 401);
    const user = await requireUser();
    return { id: user.id, name: user.name, role: user.role };
  });
}
export async function GET() {
  return api(async () => {
    const user = await requireUser();
    return { id: user.id, name: user.name, role: user.role };
  });
}
