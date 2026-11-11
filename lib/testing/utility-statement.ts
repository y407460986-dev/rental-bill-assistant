import type { Extraction } from "../contracts/extraction";

// Manual transcription of a German utility statement layout, used only as a test
// fixture. It must never be passed off as a real model extraction result.
export function utilityStatement(): Extraction {
  return {
    currency: "EUR",
    settlementTotal: "1010.10",
    advancePayments: "859.58",
    amountDue: "150.52",
    nextPeriodAdvance: "116.26",
    issueDate: "2024-07-04",
    servicePeriodStart: null,
    servicePeriodEnd: null,
    lineItems: [
      {
        label: "Strom",
        net: "877.60",
        tax: "163.50",
        gross: "1014.10",
      },
      {
        label: "Zusatzkosten",
        net: "3.00",
        tax: "1.00",
        gross: "4.00",
      },
    ],
    evidence: [
      "settlementTotal",
      "advancePayments",
      "amountDue",
      "nextPeriodAdvance",
    ].map((field) => ({
      field,
      rawText: "utility statement page",
      page: 1,
      region: "amount table",
    })),
    issues: [],
    notes: [],
    syntheticLabelPresent: false,
  };
}

// The visible page has no printed service period. The user assigned the
// September 2026 demo period and confirmed that the supplier advance was paid
// in the previous month. This is a marked manual demo basis, not model output.
export function utilityStatementMonthly(): Extraction {
  const value = utilityStatement();
  value.servicePeriodStart = "2026-09-01";
  value.servicePeriodEnd = "2026-10-01";
  value.evidence.push(
    {
      field: "servicePeriodStart",
      rawText: "User-assigned simulated service start",
      page: 1,
      region: "manual-demo-period",
    },
    {
      field: "servicePeriodEnd",
      rawText: "User-assigned simulated exclusive service end",
      page: 1,
      region: "manual-demo-period",
    },
  );
  return value;
}
