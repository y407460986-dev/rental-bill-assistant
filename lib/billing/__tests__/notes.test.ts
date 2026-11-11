import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MoneyDecimal } from "../../utils/decimal";
import {
  observedNotes,
  observedStatement,
} from "../../testing/observed-statement";

const f = vi.hoisted(() => ({
  version: {} as Record<string, unknown>,
  job: {} as Record<string, unknown>,
  charges: [] as Record<string, unknown>[],
  extract: vi.fn(),
  ocr: vi.fn(),
  bill: {} as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("../access", () => ({ ownedBill: async () => f.bill }));
vi.mock("@/lib/ai/extract", () => ({ extract: f.extract }));
vi.mock("@/lib/ai/ocr-read", () => ({ readBillText: f.ocr }));
vi.mock("@/lib/storage/server", () => ({
  readEvidence: async () => new Blob(["fixture"]),
}));
vi.mock("@/lib/db", () => ({ getDb: () => db }));
import { formatAmountsForOcr } from "../../ai/ocr-verify";
import { generateDraft, processBill, publish } from "../workflow";

// Isolated persistence boundary; extraction, reconciliation, allocation,
// snapshots, fingerprints and workflow state transitions execute real code.
const db = {
  $queryRaw: async () => [],
  $transaction: async (run: (tx: unknown) => unknown) => run(db),
  processingJob: {
    findUniqueOrThrow: async () => f.job,
    findUnique: async () => f.job,
    updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(f.job, data);
      return { count: 1 };
    },
  },
  sourceDocument: {
    update: async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(f.bill.sourceDocument as object, data);
    },
  },
  billVersion: {
    count: async () => 0,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      f.version = { id: "version", status: "DRAFT", ...data };
      return f.version;
    },
    findFirst: async ({ where }: { where: { status?: string } }) =>
      where.status ? null : f.version,
    findUnique: async () => f.version,
    findUniqueOrThrow: async () => ({ ...f.version, bill: f.bill }),
    update: async ({ data }: { data: Record<string, unknown> }) =>
      Object.assign(f.version, data),
  },
  tenancy: {
    findMany: async () => [
      {
        id: "tenancy",
        tenantId: "tenant",
        propertyId: "property",
        roomId: null,
        billingStartDate: new Date("2026-11-10T00:00:00Z"),
        billingEndDate: new Date("2026-12-11T00:00:00Z"),
        application: {
          status: "APPROVED",
          tenantId: "tenant",
          propertyId: "property",
          roomId: null,
        },
        confirmations: ["owner", "tenant"].map((userId) => ({
          policyVersionId: "policy",
          userId,
        })),
      },
    ],
  },
  allocationPolicyVersion: {
    findMany: async () => [
      {
        id: "policy",
        roomId: null,
        allocationMethod: "PERSON_DAYS",
        vacancyResponsibility: "LANDLORD",
        effectiveStart: new Date("2026-11-10T00:00:00Z"),
        effectiveEnd: null,
        terms: { scope: "PROPERTY_PERSON_DAYS", tenantPrepayments: "NONE" },
      },
    ],
  },
  charge: {
    deleteMany: async () => {
      f.charges = [];
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      f.charges.push({
        ...data,
        actualShare: new MoneyDecimal(String(data.actualShare)),
        netAmountDue: new MoneyDecimal(String(data.netAmountDue)),
      });
    },
    findMany: async () => f.charges,
  },
};

beforeEach(() => {
  f.extract.mockReset();
  f.ocr.mockReset();
  f.ocr.mockImplementation(async () => {
    const result = await f.extract.mock.results.at(-1)?.value;
    return result?.data ? formatAmountsForOcr(result.data) : "";
  });
  f.version = {};
  f.charges = [];
  f.job = { status: "QUEUED", attempts: 0, leaseUntil: null };
  f.bill = {
    id: "bill",
    propertyId: "property",
    roomId: null,
    utilityType: "ELECTRICITY",
    property: { landlordId: "owner" },
    contributions: [],
    sourceDocumentId: "source",
    sourceDocument: {
      id: "source",
      fileHash: "fixture-hash",
      storagePath: "fixture",
      isSynthetic: false,
    },
    versions: [],
    processing: f.job,
  };
});
afterEach(() => vi.restoreAllMocks());

it.each(["issues", "notes"] as const)(
  "automatically generates and publishes with observed %s, synthetic marking and null issue date",
  async (field) => {
    f.extract.mockResolvedValue({
      data: observedStatement(field),
      model: "fixture",
    });
    expect(await processBill("bill", "owner")).toMatchObject({
      status: "READY",
    });
    expect(f.version).toMatchObject({
      status: "READY",
      reconciliationIssues: [],
    });
    expect(f.job).toMatchObject({
      status: "READY",
      leaseUntil: null,
      leaseToken: null,
    });
    expect(f.bill.sourceDocument).toMatchObject({ isSynthetic: true });
    expect(f.charges).toMatchObject([{ tenantId: "tenant", daysOccupied: 31 }]);
    expect(f.charges).toHaveLength(1);
    expect(String(f.charges[0].actualShare)).toBe("1.19");
    expect(f.version.snapshot).toMatchObject({
      data: {
        notes: observedNotes,
        issueDate: null,
        servicePeriodEnd: "2026-12-11",
      },
    });
    expect(
      await publish(
        "bill",
        "owner",
        "version",
        String(f.version.inputFingerprint),
        "publish-key",
      ),
    ).toMatchObject({ status: "PUBLISHED" });
  },
);

it("recovers a saved legacy draft without a provider call or manual settlement", async () => {
  const { notes: _notes, ...legacy } = observedStatement("issues");
  void _notes;
  f.version = {
    id: "version",
    billId: "bill",
    status: "DRAFT",
    extractedLineItems: legacy,
    reconciliationIssues: observedNotes,
  };
  f.job.status = "NEEDS_REVIEW";
  await generateDraft("bill", "version");
  expect(f.version).toMatchObject({
    status: "READY",
    reconciliationIssues: [],
    snapshot: { data: { notes: observedNotes } },
  });
  expect(String(f.charges[0].actualShare)).toBe("1.19");
  expect(f.extract).not.toHaveBeenCalled();
});
it("regenerates a legacy READY fingerprint before publishing without extraction", async () => {
  const { notes: _notes, ...legacy } = observedStatement();
  void _notes;
  f.version = {
    id: "version",
    billId: "bill",
    status: "READY",
    extractedLineItems: legacy,
    inputFingerprint: "pre-notes-fingerprint",
  };
  f.job.status = "READY";
  await expect(
    publish("bill", "owner", "version", "pre-notes-fingerprint", "key"),
  ).rejects.toMatchObject({ code: "STALE_INPUTS" });
  const draft = await generateDraft("bill", "version");
  expect(
    await publish("bill", "owner", "version", draft.fingerprint, "key"),
  ).toMatchObject({ status: "PUBLISHED" });
  expect(f.extract).not.toHaveBeenCalled();
});

it.each(["tax", "settlement", "evidence"] as const)(
  "keeps a real %s discrepancy blocking despite informational notes",
  async (problem) => {
    const data = observedStatement("issues");
    const blocker =
      problem === "tax"
        ? "TAX_LINE_MISMATCH: Electricity"
        : problem === "settlement"
          ? "SETTLEMENT_MISMATCH"
          : "EVIDENCE_MISSING: amountDue";
    if (problem === "tax") data.lineItems[0].tax = "0.20";
    if (problem === "settlement") data.amountDue = "1.18";
    if (problem === "evidence")
      data.evidence = data.evidence.filter(
        (item) => item.field !== "amountDue",
      );
    f.extract.mockResolvedValue({ data, model: "fixture" });
    expect(await processBill("bill", "owner")).toMatchObject({
      status: "NEEDS_REVIEW",
    });
    expect(f.version).toMatchObject({
      status: "DRAFT",
      reconciliationIssues: [blocker],
    });
    expect(f.charges).toEqual([]);
    await expect(generateDraft("bill", "version")).rejects.toMatchObject({
      code: "RECONCILIATION_REQUIRED",
    });
    await expect(
      publish("bill", "owner", "version", "", "key"),
    ).rejects.toMatchObject({ code: "VERSION_NOT_READY" });
  },
);

it.each([
  { failure: "OCR_TIMEOUT", code: "OCR_TIMEOUT" },
  { failure: "OCR_ASSET_MISSING", code: "OCR_ASSET_MISSING" },
  { failure: "OCR_WORKER_START_FAILED", code: "OCR_WORKER_START_FAILED" },
  { failure: "OCR_READ_FAILED", code: "OCR_READ_FAILED" },
  {
    failure: "Cannot load /private/worker.js?token=sensitive-worker-token",
    code: "OCR_READ_FAILED",
  },
  { failure: "OCR_TIMEOUT: /private/worker.js", code: "OCR_READ_FAILED" },
  { failure: "non-Error rejection", code: "OCR_READ_FAILED" },
  { failure: "deferred", code: "OCR_READ_FAILED" },
])(
  "retains extraction and blocks every publication path when OCR fails: $failure",
  async ({ failure, code }) => {
    f.extract.mockResolvedValue({
      data: observedStatement(),
      model: "deepseek-flash",
    });
    f.ocr.mockRejectedValue(
      failure === "non-Error rejection" ? "OCR_TIMEOUT" : new Error(failure),
    );
    const deadline = Date.now() + (failure === "deferred" ? 45000 : 105000);
    expect(await processBill("bill", "owner", deadline)).toEqual({
      status: "NEEDS_REVIEW",
      versionId: "version",
    });
    expect(f.version).toMatchObject({
      status: "DRAFT",
      amountDue: "1.19",
      reconciliationIssues: [code],
      extractedLineItems: { amountDue: "1.19", issues: [code] },
    });
    expect(f.job).toMatchObject({
      status: "NEEDS_REVIEW",
      errorCode: code,
      leaseToken: null,
      leaseUntil: null,
    });
    expect(JSON.stringify({ version: f.version, job: f.job })).not.toMatch(
      /\/private\/|sensitive-worker-token/,
    );
    expect(f.bill.sourceDocument).toMatchObject({ isSynthetic: true });
    expect(f.charges).toEqual([]);
    expect(f.ocr).toHaveBeenCalledTimes(failure === "deferred" ? 0 : 1);
    await expect(generateDraft("bill", "version")).rejects.toMatchObject({
      code: "RECONCILIATION_REQUIRED",
    });
    await expect(
      publish("bill", "owner", "version", "", "key"),
    ).rejects.toMatchObject({ code: "VERSION_NOT_READY" });
  },
);

it("checkpoints extraction and a blocking review job before OCR starts", async () => {
  f.extract.mockResolvedValue({
    data: observedStatement(),
    model: "deepseek-flash",
  });
  f.ocr.mockImplementation(async () => {
    expect(f.version).toMatchObject({
      amountDue: "1.19",
      extractedLineItems: { issues: ["OCR_READ_FAILED"] },
    });
    expect(f.job).toMatchObject({
      status: "NEEDS_REVIEW",
      errorCode: "OCR_READ_FAILED",
    });
    return "Electricity 1.00 tax 0.19 total 1.19";
  });
  expect(await processBill("bill", "owner")).toMatchObject({ status: "READY" });
  expect(f.version).toMatchObject({
    reconciliationIssues: [],
    extractedLineItems: { issues: [] },
  });
  expect(f.job).toMatchObject({
    status: "READY",
    errorCode: null,
    leaseUntil: null,
  });
  expect(String(f.charges[0].actualShare)).toBe("1.19");
});

it("blocks generated charges and publication for an OCR-only amount mismatch", async () => {
  f.extract.mockResolvedValue({
    data: observedStatement(),
    model: "deepseek-flash",
  });
  f.ocr.mockResolvedValue("Electricity 2.00 tax 0.38 total 2.38");
  expect(await processBill("bill", "owner")).toMatchObject({
    status: "NEEDS_REVIEW",
  });
  expect(f.version).toMatchObject({
    reconciliationIssues: expect.arrayContaining([
      "OCR_AMOUNT_MISMATCH: settlementTotal 1.19",
    ]),
  });
  expect(f.charges).toEqual([]);
  await expect(generateDraft("bill", "version")).rejects.toMatchObject({
    code: "RECONCILIATION_REQUIRED",
  });
  await expect(
    publish("bill", "owner", "version", "", "key"),
  ).rejects.toMatchObject({ code: "VERSION_NOT_READY" });
});

it("retains verified extraction when calculation is deferred, then uses official Save draft", async () => {
  const start = Date.now();
  f.extract.mockResolvedValue({
    data: observedStatement(),
    model: "deepseek-flash",
  });
  f.ocr.mockImplementation(async () => {
    vi.spyOn(Date, "now").mockReturnValue(start + 70000);
    return "Electricity 1.00 tax 0.19 total 1.19";
  });
  expect(await processBill("bill", "owner", start + 105000)).toMatchObject({
    status: "NEEDS_REVIEW",
  });
  expect(f.version).toMatchObject({
    extractedLineItems: { issues: [] },
    reconciliationIssues: ["PROCESSING_DEADLINE_EXCEEDED"],
  });
  expect(f.job).toMatchObject({
    errorCode: "PROCESSING_DEADLINE_EXCEEDED",
    leaseUntil: null,
  });
  await generateDraft("bill", "version");
  expect(f.version.status).toBe("READY");
  expect(String(f.charges[0].actualShare)).toBe("1.19");
});

it("keeps the checkpoint and releases the lease if saving OCR review fails", async () => {
  f.extract.mockResolvedValue({
    data: observedStatement(),
    model: "deepseek-flash",
  });
  vi.spyOn(db.billVersion, "update").mockRejectedValueOnce(
    new Error("database write failed"),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(processBill("bill", "owner")).rejects.toThrow(
    "database write failed",
  );
  expect(f.version).toMatchObject({
    amountDue: "1.19",
    extractedLineItems: { issues: ["OCR_READ_FAILED"] },
  });
  expect(f.job).toMatchObject({
    status: "FAILED",
    errorCode: "PROCESSING_FAILED",
    leaseToken: null,
    leaseUntil: null,
  });
  expect(f.charges).toEqual([]);
});
