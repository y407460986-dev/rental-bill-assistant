import { z } from "zod";
import { isCalendarDate } from "../utils/date";
// ISO 4217 code; the database stores it as text so new currencies need no migration.
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export const UtilityTypeSchema = z.enum(["ELECTRICITY", "WATER", "GAS"]);
export const AllocationMethodSchema = z.enum(["EQUAL", "PERSON_DAYS"]);
export const DateOnlySchema = z
  .string()
  .refine(isCalendarDate, "Expected valid YYYY-MM-DD");
export const MoneySchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,11})\.\d{2}$/,
    "Expected a non-negative decimal string with two decimal places",
  );
export const TenancyInputSchema = z.strictObject({
  tenantId: z.string().min(1).max(128),
  billingStartDate: DateOnlySchema,
  billingEndDate: DateOnlySchema.nullable(),
});
// Caller must filter records to one authorized property/room and confirmed policy.
export const AllocationInputSchema = z.strictObject({
  amount: MoneySchema,
  currency: CurrencySchema,
  servicePeriodStart: DateOnlySchema,
  servicePeriodEnd: DateOnlySchema,
  tenancies: z.array(TenancyInputSchema).min(1).max(1000),
  method: AllocationMethodSchema,
  vacancyResponsibility: z
    .enum(["PENDING", "LANDLORD", "DISTRIBUTE"])
    .default("PENDING"),
});
export type AllocationInput = z.input<typeof AllocationInputSchema>;
