import { AllocationInputSchema } from "../contracts/allocation";
import {
  calendarDays,
  coveredDays,
  intersectPeriods,
  validatePeriod,
} from "../utils/date";
import { distributeRemainder } from "../utils/decimal";
import { currencyDecimals } from "../utils/currency";
import { allocateEqually } from "./equal-split";
import { allocateByPersonDays } from "./person-days";
import type { AllocationResult } from "./types";
export class NoOccupancyError extends Error {
  constructor() {
    super("No participant overlaps this service period");
    this.name = "NoOccupancyError";
  }
}
export class VacancyRuleRequiredError extends Error {
  constructor() {
    super("Confirm responsibility for uncovered service dates");
    this.name = "VacancyRuleRequiredError";
  }
}
/** Calculate a confirmed charge item; never infer policies or publish fees. */
export function allocate(rawInput: unknown): AllocationResult {
  const input = AllocationInputSchema.parse(rawInput);
  const { servicePeriodStart: start, servicePeriodEnd: end } = input;
  validatePeriod(start, end);
  if (
    new Set(input.tenancies.map((t) => t.tenantId)).size !==
    input.tenancies.length
  )
    throw new Error(
      "Duplicate participant; consolidate tenancy intervals before calculation",
    );
  const people = input.tenancies
    .map((t) => ({
      id: t.tenantId,
      days: intersectPeriods(start, end, t.billingStartDate, t.billingEndDate),
    }))
    .filter((p) => p.days > 0);
  if (!people.length) throw new NoOccupancyError();
  const periodDays = calendarDays(start, end);
  const occupiedDays = coveredDays(
    start,
    end,
    input.tenancies.map((t) => ({
      start: t.billingStartDate,
      end: t.billingEndDate,
    })),
  );
  const uncoveredDays = periodDays - occupiedDays;
  const decimals = currencyDecimals(input.currency);
  if (uncoveredDays && input.vacancyResponsibility === "PENDING")
    throw new VacancyRuleRequiredError();
  let rows;
  if (uncoveredDays && input.vacancyResponsibility === "LANDLORD") {
    // Apply an explicitly selected average-daily vacancy policy before sharing covered dates.
    const totalWeight =
      input.method === "EQUAL"
        ? people.length
        : people.reduce((sum, p) => sum + p.days, 0);
    rows = distributeRemainder(
      [
        ...people.map((p) => ({
          id: `tenant:${p.id}`,
          weight: String(
            (input.method === "EQUAL" ? 1 : p.days) * occupiedDays,
          ),
        })),
        { id: "vacancy:landlord", weight: String(uncoveredDays * totalWeight) },
      ],
      input.amount,
      decimals,
    );
  } else {
    const namespaced = people.map((p) => ({ ...p, id: `tenant:${p.id}` }));
    rows =
      input.method === "EQUAL"
        ? allocateEqually(
            input.amount,
            namespaced.map((p) => p.id),
            decimals,
          )
        : allocateByPersonDays(input.amount, namespaced, decimals);
  }
  const landlord = rows.find((s) => s.id === "vacancy:landlord");
  return {
    currency: input.currency,
    total: input.amount,
    uncoveredDays,
    landlordShare: landlord?.actualShare ?? (decimals === 0 ? "0" : "0.00"),
    landlordRemainderCents: landlord?.remainderCents ?? 0,
    charges: people.map((p) => {
      const row = rows.find((s) => s.id === `tenant:${p.id}`)!;
      return {
        tenantId: p.id,
        daysOccupied: p.days,
        shareBeforeRounding: row.shareBeforeRounding,
        actualShare: row.actualShare,
        remainderCents: row.remainderCents,
        netAmountDue: row.actualShare,
      };
    }),
  };
}
