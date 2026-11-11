import type { ChargeCalculation } from "../types/charge";
import type { Currency } from "../types/common";
export type { AllocationInput } from "../contracts/allocation";
export interface AllocationResult {
  currency: Currency;
  total: string;
  charges: ChargeCalculation[];
  landlordShare: string;
  landlordRemainderCents: number;
  uncoveredDays: number;
}
