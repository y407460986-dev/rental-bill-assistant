import { distributeRemainder, type RoundedShare } from "../utils/decimal";
export function allocateEqually(
  amount: string,
  participantIds: string[],
  decimals: 0 | 2 = 2,
): RoundedShare[] {
  return distributeRemainder(
    participantIds.map((id) => ({ id, weight: "1" })),
    amount,
    decimals,
  );
}
