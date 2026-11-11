import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function must(
  value: unknown,
  code: string,
  status = 409,
): asserts value {
  if (!value) throw new AppError(status, code);
}
export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_BASE_URL || request.url).origin;
  must(origin === expected, "INVALID_ORIGIN", 403);
}
export async function api(action: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await action(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof ZodError
          ? "INVALID_INPUT"
          : "REQUEST_FAILED";
    return Response.json(
      { error: code },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new AppError(503, "MISSING_" + name);
  return value;
}
