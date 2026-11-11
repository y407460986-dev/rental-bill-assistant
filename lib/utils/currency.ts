import { CurrencySchema, MoneySchema } from "../contracts/allocation";
import type { Currency } from "../types/common";

// ISO 4217 minor units come from Intl so the table does not drift. PayPal
// additionally rejects decimals for HUF and TWD even though ISO prints two.
const paypalZeroDecimal = new Set(["HUF", "TWD"]);
export function currencyDecimals(currency: Currency): 0 | 2 {
  if (paypalZeroDecimal.has(currency)) return 0;
  try {
    const digits =
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    if (digits === 0 || digits === 2) return digits;
  } catch {
    return 2;
  }
  // Decimal(14,2) columns cannot store 3- or 4-decimal currencies, so reject
  // them instead of truncating an amount silently.
  throw new Error("Unsupported currency precision");
}
/** Parse only the declared decimal/grouping convention; never guess from punctuation. */
export function parseCurrencyInput(
  input: string,
  locale: "de-DE" | "en-US",
  decimals: 0 | 2 = 2,
): string {
  if (locale !== "de-DE" && locale !== "en-US")
    throw new Error("Unsupported amount locale");
  const value = input.trim();
  const pattern =
    decimals === 0
      ? locale === "de-DE"
        ? /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/
        : /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/
      : locale === "de-DE"
        ? /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+),\d{2}$/
        : /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\.\d{2}$/;
  if (!pattern.test(value)) throw new Error("Invalid localized amount");
  const normalized =
    locale === "de-DE"
      ? value.replaceAll(".", "").replace(",", ".")
      : value.replaceAll(",", "");
  // Stored money strings keep two decimals even for zero-decimal currencies.
  return MoneySchema.parse(decimals === 0 ? normalized + ".00" : normalized);
}
/** Number only, with the currency's own minor units; callers print the code. */
export function formatAmount(
  amount: string,
  currency: Currency,
  locale: string,
): string {
  CurrencySchema.parse(currency);
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(amount))
    throw new Error("Invalid amount");
  const digits = currencyDecimals(currency);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(amount));
}
export function formatCurrency(
  amount: string,
  currency: Currency,
  locale: string,
): string {
  CurrencySchema.parse(currency);
  // Stored amounts arrive as "1500" or "1500.00"; Intl renders each currency
  // with its own minor units, so JPY never shows yen cents.
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(amount))
    throw new Error("Invalid amount");
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    Number(amount),
  );
}
