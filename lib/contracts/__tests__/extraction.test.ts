import { describe, it, expect } from "vitest";
import { reconcile, parseExtraction } from "../extraction";
import { synthetic } from "../../testing/synthetic";
import {
  observedNotes,
  observedStatement,
} from "../../testing/observed-statement";
import { splitReviewRemarks } from "../review-remarks";
describe("bill reconciliation", () => {
  it("accepts a complete synthetic statement", () =>
    expect(reconcile(parseExtraction(synthetic()))).toEqual([]));
  it.each(["issues", "notes"] as const)(
    "keeps observed %s non-blocking without changing source facts",
    (field) => {
      const source = observedStatement(field);
      expect(reconcile(source)).toEqual([]);
      const data = parseExtraction(source);
      expect(data.issues).toEqual([]);
      expect(data.notes).toEqual(observedNotes);
      expect(data.servicePeriodEnd).toBe("2026-12-11");
      expect(data.lineItems).toEqual(source.lineItems);
      expect(data.evidence).toEqual(source.evidence);
      expect(reconcile(data)).toEqual([]);
    },
  );
  it("reads old saved extraction JSON without losing mis-filed notes", () => {
    const { notes: _notes, ...legacy } = observedStatement("issues");
    void _notes;
    expect(parseExtraction(legacy)).toMatchObject({
      issues: [],
      notes: observedNotes,
    });
  });
  it("reparses normalized notes without dropping remarks at the old array boundary", () => {
    const source = observedStatement("issues");
    source.notes = Array.from(
      { length: 30 },
      (_, index) => "Informational remark " + index,
    );
    const normalized = parseExtraction(source);
    expect(normalized.notes).toEqual([...source.notes, ...observedNotes]);
    expect(parseExtraction(normalized)).toEqual(normalized);
    expect(reconcile(normalized)).toEqual([]);
  });
  it.each([
    "Service period end 2028-02-29 is inclusive; converted to exclusive 2028-03-01.",
    "Service period end 2026-12-31 is inclusive; converted to exclusive 2027-01-01.",
    "Net 1000.00 plus tax 190.00 equals 1190.00, consistent with gross amount.",
  ])(
    "recognizes completed operations with other dates and amounts: %s",
    (note) => {
      expect(splitReviewRemarks([note])).toEqual({ issues: [], notes: [note] });
    },
  );
  it.each([
    "Service period end 2026-12-10 is inclusive; conversion to exclusive is required.",
    "Service period end 2026-12-10 is inclusive; converted to exclusive 2026-12-12.",
    "Service period end 2026-02-30 is inclusive; converted to exclusive 2026-03-01.",
    "Net 1.00 plus tax 0.20 equals 1.19, consistent with gross amount.",
    "Net 1.00 plus tax 0.19 equals 1.19, inconsistent with gross amount.",
    observedNotes[0] + " Missing evidence; review required.",
    observedNotes[1] + " But the settlement total differs.",
    "No service-period evidence is visible.",
  ])("retains unresolved or unsupported text as blocking: %s", (issue) => {
    expect(reconcile({ ...observedStatement(), issues: [issue] })).toContain(
      issue,
    );
  });
  it.each(["issues", "notes"] as const)(
    "does not let %s waive deterministic discrepancies",
    (field) => {
      const value = observedStatement(field);
      value.lineItems[0].tax = "0.20";
      value.amountDue = "1.18";
      value.evidence = value.evidence.filter(
        (item) => item.field !== "amountDue",
      );
      expect(reconcile(value)).toEqual(
        expect.arrayContaining([
          "TAX_LINE_MISMATCH: Electricity",
          "SETTLEMENT_MISMATCH",
          "EVIDENCE_MISSING: amountDue",
        ]),
      );
    },
  );
  it("does not confuse issue date with service period", () => {
    const value = synthetic();
    value.servicePeriodStart = null;
    value.servicePeriodEnd = null;
    expect(reconcile(value)).toContain("SERVICE_PERIOD_MISSING");
  });
  it("blocks the utility statement tax and line-total conflicts", () => {
    const value = synthetic();
    Object.assign(value, {
      settlementTotal: "1010.10",
      advancePayments: "859.58",
      amountDue: "150.52",
      lineItems: [
        { label: "Strom", net: "877.60", tax: "163.50", gross: "1014.10" },
        { label: "Zusatzkosten", net: "3.00", tax: "1.00", gross: "4.00" },
      ],
    });
    const issues = reconcile(value);
    expect(issues).toContain("TAX_LINE_MISMATCH: Strom");
    expect(issues).toContain("LINE_ITEMS_TOTAL_MISMATCH");
    expect(issues).not.toContain("SETTLEMENT_MISMATCH");
  });
  it("blocks statements that omit line items", () => {
    const value = synthetic();
    value.lineItems = [];
    expect(reconcile(value)).toContain("LINE_ITEMS_MISSING");
  });
  it("normalises localised provider money into decimal strings", () => {
    for (const [raw, expected] of [
      ["1.204,45", "1204.45"],
      ["1,204.45", "1204.45"],
      ["1010,10", "1010.10"],
      ["-1.204,45", "-1204.45"],
      ["1 010,10", "1010.10"],
      ["1.204,45 €", "1204.45"],
      ["EUR 1.204,45", "1204.45"],
      ["\u22121.204,45", "-1204.45"],
      ["(1.204,45)", "-1204.45"],
    ] as const) {
      const value = parseExtraction({ ...synthetic(), settlementTotal: raw });
      expect(value.settlementTotal).toBe(expected);
    }
  });
  it("rejects ambiguous grouped amounts instead of guessing", () => {
    expect(() =>
      parseExtraction({ ...synthetic(), settlementTotal: "1,204" }),
    ).toThrow();
    expect(() =>
      parseExtraction({ ...synthetic(), settlementTotal: "1.204" }),
    ).toThrow();
  });
  it("accepts non-EUR statements without flagging them", () => {
    const value = parseExtraction({ ...synthetic(), currency: "PLN" });
    expect(value.currency).toBe("PLN");
    expect(reconcile(value)).not.toContain("NON_EUR_RECORD_ONLY");
    expect(reconcile(value)).not.toContain("EUR_REQUIRED");
  });
  it("flags a statement that does not state its currency", () => {
    const value = parseExtraction({ ...synthetic(), currency: null });
    expect(reconcile(value)).toContain("CURRENCY_MISSING");
  });
  it("rejects currencies with more minor units than the money columns store", () => {
    expect(() =>
      parseExtraction({ ...synthetic(), currency: "KWD" }),
    ).toThrow();
  });
  it("accepts any three-letter ISO currency code", () => {
    expect(parseExtraction({ ...synthetic(), currency: "XAU" }).currency).toBe(
      "XAU",
    );
    expect(() =>
      parseExtraction({ ...synthetic(), currency: "EURO" }),
    ).toThrow();
  });
  it("normalizes provider money before deterministic allocation", () => {
    const value = parseExtraction({
      ...synthetic(),
      settlementTotal: "180",
      advancePayments: "0",
      amountDue: "180.0",
    });
    expect(value.settlementTotal).toBe("180.00");
    expect(value.advancePayments).toBe("0.00");
    expect(value.amountDue).toBe("180.00");
    expect(reconcile(value)).toEqual([]);
  });
  it("keeps next period advance out of current arithmetic", () => {
    const value = synthetic();
    value.nextPeriodAdvance = "116.26";
    expect(reconcile(value)).toEqual([]);
  });
  it("blocks missing evidence", () => {
    const value = synthetic();
    value.evidence = [];
    expect(reconcile(value)).toContain("EVIDENCE_MISSING: settlementTotal");
  });
  it("rejects impossible service dates", () => {
    const value = synthetic();
    value.servicePeriodStart = "2026-02-30";
    expect(reconcile(value)).toContain("SERVICE_PERIOD_INVALID");
  });
  it("blocks refunds and arithmetic mismatch", () => {
    const value = synthetic();
    value.settlementTotal = "-1.00";
    expect(reconcile(value)).toEqual(
      expect.arrayContaining(["REFUND_UNSUPPORTED", "SETTLEMENT_MISMATCH"]),
    );
  });
  it("rejects numeric money and unexpected properties", () => {
    expect(() => parseExtraction({ ...synthetic(), amountDue: 180 })).toThrow();
    expect(() =>
      parseExtraction({ ...synthetic(), role: "landlord" }),
    ).toThrow();
  });
});
