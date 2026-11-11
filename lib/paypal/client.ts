import "server-only";
import { AppError, env, must } from "@/lib/http";
export async function paypal(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  must(env("PAYPAL_ENVIRONMENT") === "sandbox", "SANDBOX_ONLY", 503);
  const base = "https://api-m.sandbox.paypal.com";
  const tokenResponse = await fetch(base + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          env("PAYPAL_CLIENT_ID") + ":" + env("PAYPAL_CLIENT_SECRET"),
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  must(tokenResponse.ok, "PAYPAL_AUTH_FAILED", 502);
  const { access_token } = await tokenResponse.json();
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: "Bearer " + access_token,
      "Content-Type": "application/json",
      ...(key ? { "PayPal-Request-Id": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    // PayPal explains unsupported currencies and other rejections in the body;
    // surface that text instead of guessing a support list ourselves.
    const body = await response.json().catch(() => null);
    const detail =
      body?.details?.[0]?.description || body?.message || body?.name || "";
    throw new AppError(
      502,
      detail
        ? "PAYPAL_REJECTED: " + String(detail).slice(0, 200)
        : "PAYPAL_RESULT_UNCERTAIN_RETRY_OR_QUERY",
    );
  }
  return response.json();
}
