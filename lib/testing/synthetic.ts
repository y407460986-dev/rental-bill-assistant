import type { Extraction } from "../contracts/extraction";
export function synthetic(): Extraction {
  return {
    currency: "EUR",
    settlementTotal: "180.00",
    advancePayments: "0.00",
    amountDue: "180.00",
    nextPeriodAdvance: "0.00",
    issueDate: "2026-10-02",
    servicePeriodStart: "2026-09-01",
    servicePeriodEnd: "2026-10-01",
    lineItems: [
      {
        label: "Synthetic electricity",
        net: "150.00",
        tax: "30.00",
        gross: "180.00",
      },
    ],
    issues: [],
    notes: [],
    syntheticLabelPresent: true,
    evidence: [
      "settlementTotal",
      "advancePayments",
      "amountDue",
      "servicePeriodStart",
      "servicePeriodEnd",
    ].map((field) => ({
      field,
      rawText: "synthetic evidence",
      page: 1,
      region: "middle",
    })),
  };
}
