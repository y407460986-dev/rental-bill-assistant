import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { analyzeRentalQuery } from "../rental-search";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("rental provider boundary", () => {
  it("reports missing configuration without claiming AI success", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect(await analyzeRentalQuery("Berlin")).toEqual({
      filters: null,
      reason: "not_configured",
    });
  });
  it("keeps a valid numeric-budget provider response on the AI path", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  city: "Berlin",
                  maxRent: 850,
                  furnished: true,
                  keywords: ["near transit"],
                }),
              },
            },
          ],
        }),
      }),
    );
    expect((await analyzeRentalQuery("Berlin")).filters).toMatchObject({
      maxRent: "850.00",
      keywords: ["transit"],
    });
  });
  it("reports provider failures and invalid output with bounded reasons", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    expect((await analyzeRentalQuery("Berlin")).reason).toBe(
      "provider_unavailable",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            { finish_reason: "stop", message: { content: "invalid JSON" } },
          ],
        }),
      }),
    );
    expect((await analyzeRentalQuery("Berlin")).reason).toBe(
      "invalid_response",
    );
  });
  it("reports timeout without silently labelling it DeepSeek", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    );
    expect(await analyzeRentalQuery("Berlin")).toEqual({
      filters: null,
      reason: "timeout",
    });
  });
});
