import { z } from "zod";
import { calendarDays } from "../utils/date";
import { currencyDecimals } from "../utils/currency";
import { MoneyDecimal } from "../utils/decimal";
import { splitReviewRemarks } from "./review-remarks";
const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(
    (code) => {
      try {
        currencyDecimals(code);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Currency precision above two decimals is unsupported" },
  );
export type CurrencyCode = string;
const moneyPattern = /^-?\d{1,12}(\.\d{1,2})?$/;
const money = z.string().regex(moneyPattern).nullable();
// Providers copy printed amounts, which may use localised grouping and decimal
// separators ("1.204,45", "1,204.45", "1010,10"). Normalise only the
// unambiguous shapes; anything else stays untouched so validation still fails.
const currencyMarkers =
  /[€$£¥]|zł|(?:EUR|USD|GBP|PLN|CZK|CHF|SEK|NOK|DKK|HUF|RON|BGN|CAD|AUD|JPY)/gi;
export function normalizeMoneyText(raw: string): string {
  let value = raw.trim().replace(/[\s\u00a0\u202f']/g, "");
  if (!value) return raw;
  // Printed statements use a true minus sign, currency symbols and accounting
  // parentheses; none of those change the amount.
  value = value.replace(/^[\u2212\u2013\u2014]/, "-");
  value = value.replace(currencyMarkers, "");
  if (!value) return raw;
  let negative = value.startsWith("-");
  if (!negative && value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (negative) value = value.replace(/^-/, "");
  if (!/^[\d.,]+$/.test(value)) return raw;
  const sign = negative ? "-" : "";
  const dot = value.lastIndexOf(".");
  const comma = value.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    const parts = value.split(decimal);
    if (parts.length !== 2) return raw;
    const [whole, fraction] = parts;
    if (!new RegExp(`^(\\d{1,3}(${group}\\d{3})+|\\d+)$`).test(whole))
      return raw;
    if (!/^\d{1,2}$/.test(fraction)) return raw;
    return sign + whole.split(group).join("") + "." + fraction;
  }
  const separator = dot >= 0 ? "." : comma >= 0 ? "," : "";
  if (!separator) return /^\d+$/.test(value) ? sign + value : raw;
  const parts = value.split(separator);
  if (
    parts.length === 2 &&
    /^\d{1,2}$/.test(parts[1]) &&
    /^\d+$/.test(parts[0])
  )
    return sign + parts[0] + "." + parts[1];
  // "1.234.567" / "1,234,567" are unambiguous grouped integers; a lone
  // three-digit group ("1.204") is ambiguous and deliberately left to fail.
  if (
    parts.length > 2 &&
    /^\d{1,3}$/.test(parts[0]) &&
    parts.slice(1).every((part) => /^\d{3}$/.test(part))
  )
    return sign + parts.join("");
  return raw;
}
function normalizeMoneyInput(value: unknown): unknown {
  return typeof value === "string" ? normalizeMoneyText(value) : value;
}
function normalizeItems(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    return {
      ...row,
      net: normalizeMoneyInput(row.net),
      tax: normalizeMoneyInput(row.tax),
      gross: normalizeMoneyInput(row.gross),
    };
  });
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
export const ExtractionSchema = z
  .object({
    currency: currencyCode.nullable(),
    settlementTotal: money,
    advancePayments: money,
    amountDue: money,
    nextPeriodAdvance: money,
    issueDate: date,
    servicePeriodStart: date,
    servicePeriodEnd: date,
    lineItems: z
      .array(
        z
          .object({ label: z.string(), net: money, tax: money, gross: money })
          .strict(),
      )
      .max(50),
    evidence: z
      .array(
        z
          .object({
            field: z.string(),
            rawText: z.string(),
            page: z.number().int().positive(),
            region: z.string(),
          })
          .strict(),
      )
      .max(100),
    issues: z
      .array(z.string())
      .max(30)
      .describe(
        "Unresolved discrepancies only; block allocation and publication",
      ),
    notes: z
      .array(z.string())
      .describe("Informational remarks and completed checks; never blocking"),
    syntheticLabelPresent: z.boolean(),
  })
  .strict();
export type Extraction = z.infer<typeof ExtractionSchema>;
const cents = (value: string | null) =>
  value === null ? null : new MoneyDecimal(value).toFixed(2);
export function parseExtraction(input: unknown): Extraction {
  const raw = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const value = ExtractionSchema.parse({
    ...raw,
    // Older saved extractions predate the notes field; new provider output
    // still receives a schema that explicitly requires both lists.
    notes: raw.notes === undefined ? [] : raw.notes,
    settlementTotal: normalizeMoneyInput(raw.settlementTotal),
    advancePayments: normalizeMoneyInput(raw.advancePayments),
    amountDue: normalizeMoneyInput(raw.amountDue),
    nextPeriodAdvance: normalizeMoneyInput(raw.nextPeriodAdvance),
    lineItems: normalizeItems(raw.lineItems),
  });
  // Keep JSON Schema validation separate from normalization for the provider.
  return {
    ...value,
    ...splitReviewRemarks(value.issues, value.notes),
    settlementTotal: cents(value.settlementTotal),
    advancePayments: cents(value.advancePayments),
    amountDue: cents(value.amountDue),
    nextPeriodAdvance: cents(value.nextPeriodAdvance),
    lineItems: value.lineItems.map((item) => ({
      ...item,
      net: cents(item.net),
      tax: cents(item.tax),
      gross: cents(item.gross),
    })),
  };
}
export function reconcile(value: Extraction): string[] {
  const { issues } = splitReviewRemarks(value.issues, value.notes);
  if (value.currency === null) issues.push("CURRENCY_MISSING");
  if (!value.servicePeriodStart || !value.servicePeriodEnd)
    issues.push("SERVICE_PERIOD_MISSING");
  else {
    try {
      if (calendarDays(value.servicePeriodStart, value.servicePeriodEnd) <= 0)
        issues.push("SERVICE_PERIOD_INVALID");
    } catch {
      issues.push("SERVICE_PERIOD_INVALID");
    }
  }
  const {
    settlementTotal: total,
    advancePayments: advance,
    amountDue: due,
  } = value;
  if (total === null || advance === null || due === null)
    issues.push("SETTLEMENT_FIELDS_MISSING");
  else if (!new MoneyDecimal(total).minus(advance).equals(due))
    issues.push("SETTLEMENT_MISMATCH");
  for (const item of value.lineItems)
    if (
      item.net !== null &&
      item.tax !== null &&
      item.gross !== null &&
      !new MoneyDecimal(item.net).plus(item.tax).equals(item.gross)
    )
      issues.push("TAX_LINE_MISMATCH: " + item.label);
  if (value.lineItems.length === 0) issues.push("LINE_ITEMS_MISSING");
  if (
    total !== null &&
    value.lineItems.length > 0 &&
    value.lineItems.every((item) => item.gross !== null)
  ) {
    const lineTotal = value.lineItems.reduce(
      (sum, item) => sum.plus(item.gross!),
      new MoneyDecimal(0),
    );
    if (!lineTotal.equals(total)) issues.push("LINE_ITEMS_TOTAL_MISMATCH");
  }
  if (total !== null && new MoneyDecimal(total).isNegative())
    issues.push("REFUND_UNSUPPORTED");
  for (const field of [
    "settlementTotal",
    "advancePayments",
    "amountDue",
    "servicePeriodStart",
    "servicePeriodEnd",
  ]) {
    if (
      !value.evidence.some(
        (item) => item.field === field && item.rawText.trim(),
      )
    )
      issues.push("EVIDENCE_MISSING: " + field);
  }
  return [...new Set(issues)];
}
