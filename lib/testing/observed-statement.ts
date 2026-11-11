import { synthetic } from "./synthetic";

// Reconstructed regression facts, not a provider response or a bill prop.
export const observedNotes = [
  "Service period end 2026-12-10 is inclusive; converted to exclusive 2026-12-11.",
  "Net 1.00 plus tax 0.19 equals 1.19, consistent with gross amount.",
];
export function observedStatement(field: "issues" | "notes" = "notes") {
  const value = synthetic();
  Object.assign(value, {
    settlementTotal: "1.19",
    amountDue: "1.19",
    issueDate: null,
    servicePeriodStart: "2026-11-10",
    servicePeriodEnd: "2026-12-11",
    lineItems: [
      { label: "Electricity", net: "1.00", tax: "0.19", gross: "1.19" },
    ],
    [field]: [...observedNotes],
  });
  value.evidence = [
    ["settlementTotal", "1.19"],
    ["advancePayments", "0.00"],
    ["amountDue", "1.19"],
    ["servicePeriodStart", "2026-11-10"],
    ["servicePeriodEnd", "2026-12-10 (inclusive)"],
  ].map(([field, rawText]) => ({
    field,
    rawText,
    page: 1,
    region: "regression fixture",
  }));
  return value;
}
