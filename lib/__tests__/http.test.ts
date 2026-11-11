import { it, expect, vi } from "vitest";
import { sameOrigin, api } from "../http";
it("rejects missing and cross-origin writes", () => {
  vi.stubEnv("APP_BASE_URL", "https://demo.example");
  for (const origin of [undefined, "https://evil.example"])
    expect(() =>
      sameOrigin(
        new Request("https://demo.example/api", {
          headers: origin ? { origin } : {},
        }),
      ),
    ).toThrow();
  expect(() =>
    sameOrigin(
      new Request("https://demo.example/api", {
        headers: { origin: "https://demo.example" },
      }),
    ),
  ).not.toThrow();
});
it("does not return provider errors or credentials", async () => {
  const response = await api(async () => {
    throw new Error("secret database details");
  });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "REQUEST_FAILED" });
});
