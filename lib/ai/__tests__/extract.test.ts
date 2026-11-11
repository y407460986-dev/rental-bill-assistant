import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extract } from "../extract";
import { api, AppError } from "@/lib/http";

const image = new Blob(["bill"], { type: "image/png" });
const extraction = {
  currency: "EUR",
  settlementTotal: "100.00",
  advancePayments: "80.00",
  amountDue: "20.00",
  nextPeriodAdvance: null,
  issueDate: null,
  servicePeriodStart: "2025-01-01",
  servicePeriodEnd: "2026-01-01",
  lineItems: [{ label: "Strom", net: null, tax: null, gross: "100.00" }],
  evidence: [],
  issues: [],
  notes: [],
  syntheticLabelPresent: false,
};
const envelope = (content: unknown = JSON.stringify(extraction)) => ({
  model: "deepseek-flash",
  choices: [{ message: { content } }],
});

beforeEach(() => {
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubEnv("DEEPSEEK_MODEL", "deepseek-flash");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function expectApiError(status: number, code: string) {
  const response = await api(() => extract(image));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: code });
}

it("returns a strictly valid extraction and the requested/served models", async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      ...envelope(),
      model: " deepseek-flash-served ",
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const response = await api(() => extract(image));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: extraction,
    model: "deepseek-flash-served",
    requestedModel: "deepseek-flash",
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.deepseek.com/chat/completions",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it("falls back to the requested model only when no served model is supplied", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        choices: envelope().choices,
      }),
    ),
  );
  expect((await extract(image)).model).toBe("deepseek-flash");
});

it.each(["not JSON", "```json\n{}\n```", "null", "[]"])(
  "classifies malformed model output %s as a provider output error",
  async (content) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(envelope(content))),
    );
    await expectApiError(502, "AI_OUTPUT_INVALID");
  },
);

it.each([
  { ...extraction, extra: true },
  { ...extraction, amountDue: 20 },
  { ...extraction, lineItems: [{ ...extraction.lineItems[0], extra: true }] },
])("rejects extra keys and invalid schema without repair: %j", async (data) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(envelope(JSON.stringify(data)))),
  );
  await expectApiError(502, "AI_OUTPUT_INVALID");
});

it.each([
  null,
  {},
  { choices: [] },
  { choices: [{ message: null }] },
  { choices: [{ message: {} }] },
  envelope({ text: "not a string" }),
  { ...envelope(), model: 123 },
])(
  "classifies malformed response envelopes without leaking Zod errors: %j",
  async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expectApiError(502, "AI_OUTPUT_INVALID");
  },
);

it("classifies invalid provider body JSON as invalid output", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{broken")));
  await expectApiError(502, "AI_OUTPUT_INVALID");
});

it.each([
  { content: null, refusal: "Cannot process this image" },
  { refusal: "Cannot process this image" },
  { content: "", refusal: null },
])(
  "preserves explicit refusal and empty response handling: %j",
  async (message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ choices: [{ message }] })),
    );
    await expectApiError(502, "AI_REFUSED_OR_EMPTY");
  },
);

it("preserves missing configuration without calling the provider", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expectApiError(503, "MISSING_DEEPSEEK_API_KEY");
  expect(fetch).not.toHaveBeenCalled();
});

it("classifies non-OK responses as provider failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
  );
  await expectApiError(502, "AI_PROVIDER_FAILED");
});

it.each(["fetch", "body"])(
  "classifies %s transport failures",
  async (stage) => {
    const failure = new TypeError("connection interrupted");
    vi.stubGlobal(
      "fetch",
      stage === "fetch"
        ? vi.fn().mockRejectedValue(failure)
        : vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockRejectedValue(failure),
          }),
    );
    await expectApiError(502, "AI_PROVIDER_FAILED");
  },
);

it.each(["fetch", "body"])(
  "bounds a stalled %s to the supplied deadline even without abort cooperation",
  async (stage) => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<Response>().promise;
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => pending });
    if (stage === "fetch") fetch.mockReturnValue(pending);
    vi.stubGlobal("fetch", fetch);
    const responsePromise = api(() => extract(image, 25));
    await vi.advanceTimersByTimeAsync(24);
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;
    expect(signal.aborted).toBe(true);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "AI_PROVIDER_TIMEOUT" });
  },
);

it("caps a larger supplied timeout at eighty seconds", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(Promise.withResolvers<Response>().promise),
  );
  const responsePromise = api(() => extract(image, 120000));
  await vi.advanceTimersByTimeAsync(80000);
  const response = await responsePromise;
  expect(response.status).toBe(504);
  expect(await response.json()).toEqual({ error: "AI_PROVIDER_TIMEOUT" });
});

it("maps provider timeout exceptions to an AppError", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
  );
  await expect(extract(image)).rejects.toBeInstanceOf(AppError);
  await expectApiError(504, "AI_PROVIDER_TIMEOUT");
});

it("clears the deadline after a successful response", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(envelope())));
  await extract(image, 25);
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves localized amount normalization and legacy notes compatibility", async () => {
  const { notes: _notes, ...legacy } = extraction;
  void _notes;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        envelope(
          JSON.stringify({
            ...legacy,
            amountDue: "20,00",
          }),
        ),
      ),
    ),
  );
  expect((await extract(image)).data).toEqual(extraction);
});
