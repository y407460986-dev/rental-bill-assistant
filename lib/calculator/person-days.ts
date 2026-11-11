import { distributeRemainder, type RoundedShare } from "../utils/decimal";
/** Allocate using non-negative integer day weights. */
export function allocateByPersonDays(
  amount: string,
  people: Array<{ id: string; days: number }>,
  decimals: 0 | 2 = 2,
): RoundedShare[] {
  if (people.some((p) => !Number.isSafeInteger(p.days) || p.days < 0))
    throw new Error("Invalid day count");
  return distributeRemainder(
    people.map((p) => ({ id: p.id, weight: String(p.days) })),
    amount,
    decimals,
  );
}
