import Decimal from "decimal.js";

// Isolate billing precision from global configuration changes in callers.
export const MoneyDecimal = Decimal.clone({
  precision: 48,
  rounding: Decimal.ROUND_DOWN,
});
export interface WeightedShare {
  id: string;
  weight: string;
}
export interface RoundedShare {
  id: string;
  shareBeforeRounding: string;
  actualShare: string;
  remainderCents: number;
}

const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

/**
 * Split a total into integer minor units for the same currency precision.
 * Two-decimal currencies keep the historical cent behaviour; zero-decimal
 * currencies (JPY, HUF, TWD, ...) never produce fractional units.
 */
export function distributeRemainder(
  shares: WeightedShare[],
  total: string,
  decimals: 0 | 2 = 2,
): RoundedShare[] {
  if (decimals !== 0 && decimals !== 2)
    throw new Error("Unsupported currency precision");
  if (!AMOUNT.test(total)) throw new Error("Invalid monetary amount");
  if (
    !shares.length ||
    new Set(shares.map((s) => s.id)).size !== shares.length ||
    shares.some((s) => !s.id || !/^\d{1,20}$/.test(s.weight))
  )
    throw new Error("Invalid allocation weights");
  const denominator = shares.reduce(
    (sum, s) => sum.plus(s.weight),
    new MoneyDecimal(0),
  );
  if (denominator.isZero()) throw new Error("Zero allocation weight");
  const scale = new MoneyDecimal(10).pow(decimals);
  const cents = new MoneyDecimal(total).times(scale);
  if (!cents.isInteger())
    throw new Error("Invalid monetary precision for this currency");
  const rows = shares.map((s) => {
    const numerator = cents.times(s.weight);
    return {
      id: s.id,
      units: numerator.divToInt(denominator),
      residue: numerator.mod(denominator),
      shareBeforeRounding: new MoneyDecimal(total)
        .times(s.weight)
        .div(denominator)
        .toString(),
      remainderCents: 0,
    };
  });
  const remaining = cents
    .minus(rows.reduce((sum, s) => sum.plus(s.units), new MoneyDecimal(0)))
    .toNumber();
  // Code-point comparison is stable across server locales.
  const ranked = rows
    .filter((s) => !s.residue.isZero())
    .sort(
      (a, b) =>
        b.residue.comparedTo(a.residue) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  for (let i = 0; i < remaining; i++) {
    ranked[i].units = ranked[i].units.plus(1);
    ranked[i].remainderCents = 1;
  }
  const result = rows.map((s) => ({
    id: s.id,
    shareBeforeRounding: s.shareBeforeRounding,
    actualShare: s.units.div(scale).toFixed(decimals),
    remainderCents: s.remainderCents,
  }));
  if (
    !result
      .reduce((sum, s) => sum.plus(s.actualShare), new MoneyDecimal(0))
      .equals(total)
  )
    throw new AmountMismatchError("Allocated amount does not match total");
  return result;
}
export class AmountMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountMismatchError";
  }
}
