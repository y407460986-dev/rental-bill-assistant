import { describe, expect, it } from "vitest";
import { distributeRemainder } from "../../utils/decimal";
import { allocateEqually } from "../equal-split";
import { allocateByPersonDays } from "../person-days";
import { allocate } from "../allocate";

describe("zero-decimal currencies", () => {
  it("splits integer minor units without fractional yen", () => {
    const rows = distributeRemainder(
      ["a", "b", "c"].map((id) => ({ id, weight: "1" })),
      "1000",
      0,
    );
    expect(rows.map((r) => r.actualShare).sort()).toEqual([
      "333",
      "333",
      "334",
    ]);
    expect(rows.reduce((sum, r) => sum + Number(r.actualShare), 0)).toBe(1000);
  });

  it("accepts a two-decimal total for a zero-decimal currency", () => {
    const rows = allocateEqually("1000.00", ["a", "b", "c"], 0);
    expect(rows.every((r) => !r.actualShare.includes("."))).toBe(true);
  });

  it("rejects a fractional total for a zero-decimal currency", () => {
    expect(() => allocateEqually("1000.50", ["a", "b"], 0)).toThrow();
  });

  it("keeps the two-decimal behaviour unchanged", () => {
    const rows = allocateEqually("1000.00", ["a", "b", "c"]);
    expect(rows.map((r) => r.actualShare).sort()).toEqual([
      "333.33",
      "333.33",
      "333.34",
    ]);
  });

  it("allocates person-days in whole yen", () => {
    const rows = allocateByPersonDays(
      "1000",
      [
        { id: "a", days: 30 },
        { id: "b", days: 30 },
        { id: "c", days: 15 },
      ],
      0,
    );
    expect(rows.every((r) => !r.actualShare.includes("."))).toBe(true);
    expect(rows.reduce((sum, r) => sum + Number(r.actualShare), 0)).toBe(1000);
  });

  it("honours the currency precision through allocate()", () => {
    const result = allocate({
      amount: "1500.00",
      currency: "JPY",
      method: "EQUAL",
      servicePeriodStart: "2026-09-01",
      servicePeriodEnd: "2026-10-01",
      vacancyResponsibility: "DISTRIBUTE",
      tenancies: [
        {
          tenantId: "t1",
          billingStartDate: "2026-09-01",
          billingEndDate: "2026-10-01",
        },
        {
          tenantId: "t2",
          billingStartDate: "2026-09-01",
          billingEndDate: "2026-10-01",
        },
        {
          tenantId: "t3",
          billingStartDate: "2026-09-01",
          billingEndDate: "2026-10-01",
        },
      ],
    });
    expect(result.charges.map((c) => c.actualShare).sort()).toEqual([
      "500",
      "500",
      "500",
    ]);
  });
});
