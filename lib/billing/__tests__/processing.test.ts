import { it, beforeEach, afterEach, expect, vi } from "vitest";
import type * as ExtractionModule from "../../ai/extract";
const f = vi.hoisted(() => ({
  owned: vi.fn(),
  extract: vi.fn(),
  read: vi.fn(),
  ocr: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  query: vi.fn(),
  job: vi.fn(),
  count: vi.fn(),
  published: vi.fn(),
  versionUpdate: vi.fn(),
  source: { id: "source", isSynthetic: false },
}));
vi.mock("server-only", () => ({}));
vi.mock("../access", () => ({ ownedBill: f.owned }));
vi.mock("@/lib/ai/extract", () => ({ extract: f.extract }));
vi.mock("@/lib/ai/ocr-read", () => ({ readBillText: f.ocr }));
vi.mock("@/lib/auth/server", () => ({
  requireLandlord: async () => ({ id: "owner" }),
}));
vi.mock("@/lib/storage/server", () => ({ readEvidence: f.read }));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    const db = {
      processingJob: { updateMany: f.update, findUniqueOrThrow: f.job },
      sourceDocument: {
        update: async ({ data }: { data: { isSynthetic: boolean } }) => {
          f.source.isSynthetic = data.isSynthetic;
          return { ...f.source };
        },
      },
      billVersion: {
        create: f.create,
        count: f.count,
        findFirst: f.published,
        update: f.versionUpdate,
      },
      $queryRaw: f.query,
    };
    return {
      ...db,
      $transaction: async (fn: (db: unknown) => unknown) => fn(db),
    };
  },
}));
import { processBill } from "../workflow";
import { POST } from "@/app/api/organizer/bills/[id]/[action]/route";
import { api } from "../../http";
import { formatAmountsForOcr } from "../../ai/ocr-verify";
import { synthetic } from "../../testing/synthetic";
beforeEach(() => {
  vi.resetAllMocks();
  f.source.isSynthetic = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  f.owned.mockResolvedValue({
    sourceDocument: { storagePath: "private-path", isSynthetic: false },
    versions: [],
    processing: { status: "QUEUED", attempts: 0, leaseUntil: null },
  });
  f.update.mockImplementation(async (args) => {
    if (args.data.status === "PROCESSING")
      f.job.mockResolvedValue({
        leaseToken: args.data.leaseToken,
        leaseUntil: args.data.leaseUntil,
      });
    return { count: 1 };
  });
  f.count.mockResolvedValue(0);
  f.published.mockResolvedValue(null);
  f.create.mockResolvedValue({ id: "version" });
  f.read.mockResolvedValue(new Blob(["test"], { type: "image/png" }));
  f.ocr.mockImplementation(async () => {
    const result = await f.extract.mock.results.at(-1)?.value;
    return result?.data ? formatAmountsForOcr(result.data) : "";
  });
});
afterEach(() => vi.restoreAllMocks());
it("blocks a concurrent processing lease without calling providers", async () => {
  f.update.mockResolvedValue({ count: 0 });
  await expect(processBill("bill", "owner")).rejects.toMatchObject({
    code: "PROCESSING_IN_PROGRESS",
  });
  expect(f.extract).not.toHaveBeenCalled();
});
it.each([
  { initialStatus: "QUEUED", terminalStatus: "NEEDS_REVIEW" },
  { initialStatus: "QUEUED", terminalStatus: "FAILED" },
  { initialStatus: "FAILED", terminalStatus: "FAILED" },
])(
  "rejects a delayed $initialStatus claim after the first request finishes as $terminalStatus",
  async ({ initialStatus, terminalStatus }) => {
    const initialAttempts = initialStatus === "FAILED" ? 1 : 0;
    const row = {
      status: initialStatus,
      attempts: initialAttempts,
      leaseUntil: null as Date | null,
    };
    f.owned.mockResolvedValue({
      sourceDocument: { storagePath: "private-path", isSynthetic: false },
      versions: [],
      processing: { ...row },
    });
    let claims = 0;
    f.update.mockImplementation(async ({ where, data }) => {
      if (data.status === "PROCESSING") {
        claims += 1;
        // Both requests read the same snapshot. Delay the second claim until
        // the first request has released its lease, including FAILED-to-FAILED.
        if (claims === 2) await firstRequest.catch(() => undefined);
        if (
          (where.status !== undefined && where.status !== row.status) ||
          (where.attempts !== undefined && where.attempts !== row.attempts) ||
          (row.leaseUntil && row.leaseUntil >= new Date())
        ) {
          return { count: 0 };
        }
        row.attempts += 1;
        f.job.mockResolvedValue({
          leaseToken: data.leaseToken,
          leaseUntil: data.leaseUntil,
        });
      }
      row.status = data.status;
      row.leaseUntil = data.leaseUntil;
      return { count: 1 };
    });
    if (terminalStatus === "FAILED") {
      f.extract.mockRejectedValue(new Error("provider unavailable"));
    } else {
      const data = synthetic();
      data.servicePeriodStart = null;
      data.servicePeriodEnd = null;
      data.syntheticLabelPresent = false;
      f.extract.mockResolvedValue({ data, model: "test-model" });
    }
    const firstRequest = processBill("bill", "owner");
    const secondRequest = processBill("bill", "owner");
    const [first, second] = await Promise.allSettled([
      firstRequest,
      secondRequest,
    ]);
    expect(first.status).toBe(
      terminalStatus === "FAILED" ? "rejected" : "fulfilled",
    );
    expect(row).toMatchObject({
      status: terminalStatus,
      attempts: initialAttempts + 1,
      leaseUntil: null,
    });
    expect(second).toMatchObject({
      status: "rejected",
      reason: { code: "PROCESSING_IN_PROGRESS" },
    });
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.extract).toHaveBeenCalledTimes(1);
  },
);
it("saves utility statement missing service dates as NEEDS_REVIEW rather than inventing a period", async () => {
  const data = synthetic();
  data.servicePeriodStart = null;
  data.servicePeriodEnd = null;
  data.syntheticLabelPresent = false;
  f.extract.mockResolvedValue({ data, model: "test-model" });
  expect(await processBill("bill", "owner")).toMatchObject({
    status: "NEEDS_REVIEW",
  });
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        servicePeriodStart: null,
        servicePeriodEnd: null,
        reconciliationIssues: expect.arrayContaining([
          "SERVICE_PERIOD_MISSING",
        ]),
      }),
    }),
  );
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        reconciliationIssues: expect.not.arrayContaining([
          "UTILITY_REVIEW_ONLY",
        ]),
      }),
    }),
  );
});
it.each([
  { original: false, visibleLabel: true, expected: true },
  { original: false, visibleLabel: false, expected: false },
  { original: true, visibleLabel: false, expected: true },
])(
  "preserves source provenance after extracted label $visibleLabel from $original",
  async ({ original, visibleLabel, expected }) => {
    f.source.isSynthetic = original;
    f.owned.mockResolvedValue({
      sourceDocument: { ...f.source, storagePath: "private-path" },
      versions: [],
      processing: { status: "QUEUED", attempts: 0, leaseUntil: null },
    });
    const data = synthetic();
    data.syntheticLabelPresent = visibleLabel;
    data.servicePeriodStart = null;
    data.servicePeriodEnd = null;
    f.extract.mockResolvedValue({ data, model: "provider-model" });
    const result = await processBill("bill", "owner");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(f.source.isSynthetic).toBe(expected);
  },
);
it("model errors release the lease and remain FAILED", async () => {
  f.extract.mockRejectedValue(new Error("provider unavailable"));
  await expect(processBill("bill", "owner")).rejects.toThrow();
  expect(f.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "FAILED",
        leaseUntil: null,
        leaseToken: null,
      }),
    }),
  );
  expect(f.create).not.toHaveBeenCalled();
});
it("preserves the provider error if failure-state persistence also fails", async () => {
  const original = new Error("provider unavailable");
  f.extract.mockRejectedValue(original);
  f.update
    .mockResolvedValueOnce({ count: 1 })
    .mockRejectedValueOnce(new Error("database unavailable"));
  await expect(processBill("bill", "owner")).rejects.toBe(original);
  expect(f.create).not.toHaveBeenCalled();
});
it("never reprocesses a published bill", async () => {
  f.owned.mockResolvedValue({ versions: [{ status: "PUBLISHED" }] });
  await expect(processBill("bill", "owner")).rejects.toMatchObject({
    code: "VERSION_IMMUTABLE",
  });
  expect(f.extract).not.toHaveBeenCalled();
});

it("keeps a rewritten amount in NEEDS_REVIEW and does not invent a match", async () => {
  const data = synthetic();
  data.servicePeriodStart = null;
  data.servicePeriodEnd = null;
  data.syntheticLabelPresent = false;
  data.settlementTotal = "181.00";
  data.amountDue = "181.00";
  data.lineItems[0].gross = "181.00";
  f.extract.mockResolvedValue({ data, model: "deepseek-flash" });
  f.ocr.mockResolvedValue(
    "Stromkosten 150,00 Steuer 30,00 Rechnungsbetrag 180,00",
  );
  expect(await processBill("bill", "owner")).toMatchObject({
    status: "NEEDS_REVIEW",
  });
  expect(f.versionUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        reconciliationIssues: expect.arrayContaining([
          "OCR_AMOUNT_MISMATCH: settlementTotal 181.00",
        ]),
      }),
    }),
  );
});

it.each(["not json", JSON.stringify({ unexpected: true })])(
  "classifies invalid provider output and releases the job: %s",
  async (content) => {
    const { extract } =
      await vi.importActual<typeof ExtractionModule>("../../ai/extract");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-only-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content } }],
        }),
      ),
    );
    f.extract.mockImplementation(extract);
    try {
      const response = await api(() => processBill("bill", "owner"));
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "AI_OUTPUT_INVALID" });
      expect(f.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            errorCode: "AI_OUTPUT_INVALID",
            leaseToken: null,
            leaseUntil: null,
          }),
        }),
      );
      expect(f.create).not.toHaveBeenCalled();
      expect(f.ocr).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  },
);

it("saves a retryable extraction without starting OCR when request time is short", async () => {
  const start = Date.now();
  f.extract.mockImplementation(async () => {
    vi.spyOn(Date, "now").mockReturnValue(start + 80000);
    const data = synthetic();
    data.servicePeriodStart = null;
    return { data, model: "deepseek-flash" };
  });
  const result = await processBill("bill", "owner");
  expect(result).toMatchObject({
    status: "NEEDS_REVIEW",
    versionId: "version",
  });
  expect(f.ocr).not.toHaveBeenCalled();
  expect(f.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        amountDue: "180.00",
        reconciliationIssues: expect.arrayContaining(["OCR_READ_FAILED"]),
      }),
    }),
  );
  expect(f.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "NEEDS_REVIEW",
        errorCode: "OCR_READ_FAILED",
        leaseToken: null,
        leaseUntil: null,
      }),
    }),
  );
});

it.each(["review", "publish"])(
  "keeps genuine %s body errors as INVALID_INPUT",
  async (action) => {
    const response = await POST(
      new Request("https://app.example/api", {
        method: "POST",
        headers: { origin: "https://app.example" },
        body: JSON.stringify({ versionId: "" }),
      }),
      { params: Promise.resolve({ id: "bill", action }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_INPUT" });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  },
);
