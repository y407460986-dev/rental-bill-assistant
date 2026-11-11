import type { Currency } from "./common";
export interface ExtractedLineItem {
  description: string;
  originalText: string;
  amount: string;
  currency: Currency;
  evidenceReference: string;
}
export interface ReconciliationIssue {
  type: "MISSING_PERIOD" | "AMOUNT_MISMATCH" | "UNCLEAR_ADVANCE";
  description: string;
  affectsPayableAmount: boolean;
  evidenceReference?: string;
}
