import type { z } from "zod";
import type {
  CurrencySchema,
  UtilityTypeSchema,
  AllocationMethodSchema,
} from "../contracts/allocation";
export type Currency = z.infer<typeof CurrencySchema>;
export type UtilityType = z.infer<typeof UtilityTypeSchema>;
export type AllocationMethod = z.infer<typeof AllocationMethodSchema>;
