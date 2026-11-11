import { describe, it, expect } from "vitest";
import {
  allocate,
  NoOccupancyError,
  VacancyRuleRequiredError,
} from "../allocate";
import { InvalidPeriodError } from "../../utils/date";
import { MoneyDecimal } from "../../utils/decimal";
import type { AllocationInput } from "../types";
function sample(): AllocationInput {
  return {
    amount: "180.00",
    currency: "EUR",
    method: "PERSON_DAYS",
    servicePeriodStart: "2026-09-01",
    servicePeriodEnd: "2026-10-01",
    tenancies: [
      { tenantId: "A", billingStartDate: "2026-09-01", billingEndDate: null },
      {
        tenantId: "B",
        billingStartDate: "2026-09-01",
        billingEndDate: "2026-10-01",
      },
      { tenantId: "C", billingStartDate: "2026-09-16", billingEndDate: null },
    ],
  };
}
const amounts = (input: unknown) =>
  allocate(input).charges.map((c) => c.actualShare);
describe("allocation service", () => {
  it("allocates 30/30/15 days", () => {
    const r = allocate(sample());
    expect(r.charges.map((c) => c.daysOccupied)).toEqual([30, 30, 15]);
    expect(amounts(sample())).toEqual(["72.00", "72.00", "36.00"]);
    expect(r.charges.every((c) => c.netAmountDue === c.actualShare)).toBe(true);
  });
  it("combines fixed and usage items", () => {
    const f = allocate({ ...sample(), amount: "30.00", method: "EQUAL" });
    const u = allocate({ ...sample(), amount: "150.00" });
    expect(
      f.charges.map((c, i) =>
        new MoneyDecimal(c.actualShare)
          .plus(u.charges[i].actualShare)
          .toFixed(2),
      ),
    ).toEqual(["70.00", "70.00", "40.00"]);
  });
  it("assigns remainders by stable ID", () => {
    const x = { ...sample(), amount: "100.00", method: "EQUAL" };
    expect(amounts(x)).toEqual(["33.34", "33.33", "33.33"]);
    x.tenancies.reverse();
    expect(
      allocate(x).charges.find((c) => c.tenantId === "A")?.remainderCents,
    ).toBe(1);
  });
  it("supports zero and USD regression", () =>
    expect(amounts({ ...sample(), amount: "0.00", currency: "USD" })).toEqual([
      "0.00",
      "0.00",
      "0.00",
    ]));
  it("excludes adjacent future occupancy", () => {
    const x = sample();
    x.tenancies = [
      x.tenancies[0],
      { tenantId: "D", billingStartDate: "2026-10-01", billingEndDate: null },
    ];
    expect(amounts(x)).toEqual(["180.00"]);
  });
  it("excludes move-out at start", () => {
    const x = sample();
    x.tenancies[2] = {
      tenantId: "C",
      billingStartDate: "2026-08-01",
      billingEndDate: "2026-09-01",
    };
    expect(amounts(x)).toEqual(["90.00", "90.00"]);
  });
  it("counts last-day move-in", () => {
    const x = sample();
    x.tenancies[2].billingStartDate = "2026-09-30";
    expect(allocate(x).charges[2].daysOccupied).toBe(1);
  });
  it("requires a vacancy decision", () => {
    const x = sample();
    x.tenancies = [x.tenancies[2]];
    expect(() => allocate(x)).toThrow(VacancyRuleRequiredError);
  });
  it.each(["EQUAL", "PERSON_DAYS"])(
    "preserves landlord vacancy under %s",
    (method) => {
      const x = sample();
      x.tenancies = [x.tenancies[2]];
      const r = allocate({ ...x, method, vacancyResponsibility: "LANDLORD" });
      expect(r.landlordShare).toBe("90.00");
      expect(r.charges[0].actualShare).toBe("90.00");
      expect(r.uncoveredDays).toBe(15);
    },
  );
  it("redistributes only with an explicit policy", () => {
    const x = sample();
    x.tenancies = [x.tenancies[2]];
    expect(amounts({ ...x, vacancyResponsibility: "DISTRIBUTE" })).toEqual([
      "180.00",
    ]);
  });
  it("conserves a cent with landlord and tenant", () => {
    const x = sample();
    x.tenancies = [{ ...x.tenancies[2], tenantId: "vacancy:landlord" }];
    const r = allocate({
      ...x,
      amount: "0.01",
      vacancyResponsibility: "LANDLORD",
    });
    expect(
      new MoneyDecimal(r.landlordShare)
        .plus(r.charges[0].actualShare)
        .toFixed(2),
    ).toBe("0.01");
  });
  it("rejects duplicate participants", () => {
    const x = sample();
    x.tenancies.push(x.tenancies[0]);
    expect(() => allocate(x)).toThrow("Duplicate participant");
  });
  it("rejects zero occupancy", () => {
    const x = sample();
    x.tenancies = [
      { tenantId: "A", billingStartDate: "2026-10-01", billingEndDate: null },
    ];
    expect(() => allocate(x)).toThrow(NoOccupancyError);
  });
  it("rejects reversed service dates", () =>
    expect(() =>
      allocate({ ...sample(), servicePeriodEnd: "2026-08-01" }),
    ).toThrow(InvalidPeriodError));
  it("rejects reversed tenancy dates", () => {
    const x = sample();
    x.tenancies[0].billingEndDate = "2026-08-01";
    expect(() => allocate(x)).toThrow(InvalidPeriodError);
  });
  it.each([
    "-1.00",
    "1",
    "1.001",
    "NaN",
    "Infinity",
    "1e2",
    "01.00",
    "1000000000000.00",
  ])("rejects invalid amount %s", (amount) =>
    expect(() => allocate({ ...sample(), amount })).toThrow(),
  );
  it.each([
    {},
    { ...sample(), tenancies: [] },
    { ...sample(), currency: "JPYY" },
    { ...sample(), method: "CUSTOM" },
    { ...sample(), servicePeriodStart: "2026-02-30" },
    { ...sample(), unexpected: true },
    { ...sample(), amount: 180 },
  ])("rejects invalid input %j", (x) => expect(() => allocate(x)).toThrow());
});
