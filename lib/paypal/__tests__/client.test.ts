import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { paypal } from "../client";

const order = {
  id: "order",
  status: "CREATED",
};

beforeEach(() => {
  vi.stubEnv("PAYPAL_ENVIRONMENT", "sandbox");
  vi.stubEnv("PAYPAL_CLIENT_ID", "client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("surfaces PayPal's own rejection text instead of guessing support", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          name: "UNPROCESSABLE_ENTITY",
          details: [{ description: "Currency code is invalid" }],
        }),
      }),
  );
  await expect(
    paypal("/v2/checkout/orders", "POST", order),
  ).rejects.toMatchObject({
    code: "PAYPAL_REJECTED: Currency code is invalid",
  });
});

it("keeps the uncertain-result code when the provider gives no detail", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => null,
      }),
  );
  await expect(paypal("/v2/checkout/orders/order")).rejects.toMatchObject({
    code: "PAYPAL_RESULT_UNCERTAIN_RETRY_OR_QUERY",
  });
});
