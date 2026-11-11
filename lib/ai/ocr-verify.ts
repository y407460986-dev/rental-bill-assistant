import { normalizeMoneyText } from "@/lib/contracts/extraction";
import type { Extraction } from "@/lib/contracts/extraction";
import { MoneyDecimal } from "@/lib/utils/decimal";

const moneyPattern = /^-?\d{1,12}(\.\d{1,2})?$/;
const datePattern = /\b(?:\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const tokenPattern =
  /(?<![\d.,])(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?(?![\d.,])/g;

function canonical(value: string): string | null {
  const normalized = normalizeMoneyText(value);
  if (!moneyPattern.test(normalized)) return null;
  if (/^\d+$/.test(normalized)) {
    const year = Number(normalized);
    if (year >= 1900 && year <= 2099) return null;
  }
  try {
    return new MoneyDecimal(normalized).toFixed(2);
  } catch {
    return null;
  }
}

function isZero(value: string): boolean {
  return new MoneyDecimal(value).isZero();
}

export function listedExtractionAmounts(
  data: Extraction,
): { field: string; value: string }[] {
  const rows: { field: string; value: string }[] = [];
  const add = (field: string, value: string | null) => {
    if (value !== null) rows.push({ field, value });
  };
  add("settlementTotal", data.settlementTotal);
  add("advancePayments", data.advancePayments);
  add("amountDue", data.amountDue);
  add("nextPeriodAdvance", data.nextPeriodAdvance);
  data.lineItems.forEach((item, index) => {
    add(`lineItems[${index}].net`, item.net);
    add(`lineItems[${index}].tax`, item.tax);
    add(`lineItems[${index}].gross`, item.gross);
  });
  return rows;
}

export function amountsFromOcrText(text: string): Set<string> {
  const found = new Set<string>();
  const cleaned = text.replace(datePattern, " ");
  for (const match of cleaned.matchAll(tokenPattern)) {
    const value = canonical(match[0]);
    if (value) found.add(value);
  }
  return found;
}

export function formatAmountsForOcr(data: Extraction): string {
  return listedExtractionAmounts(data)
    .map(({ value }) => value.replace(".", ","))
    .join(" ");
}

export function isOcrIssue(issue: string): boolean {
  return issue.startsWith("OCR_");
}

export function verifyExtractionAgainstOcr(
  data: Extraction,
  ocrText: string,
): string[] {
  const found = amountsFromOcrText(ocrText);
  const printed = [...found].filter((value) => !isZero(value));
  if (printed.length < 2) return ["OCR_INCONCLUSIVE"];
  const issues: string[] = [];
  for (const { field, value } of listedExtractionAmounts(data)) {
    if (isZero(value)) continue;
    if (!found.has(value))
      issues.push(`OCR_AMOUNT_MISMATCH: ${field} ${value}`);
  }
  return issues;
}
