import { describe, it, expect } from "vitest";
import { allocateByPersonDays } from "../person-days";
import { MoneyDecimal } from "../../utils/decimal";
describe("person-days", () => {
  it.each([
    ["180.00", [30, 30, 15], ["72.00", "72.00", "36.00"]],
    ["0.01", [1, 2, 3], ["0.00", "0.00", "0.01"]],
    ["1.00", [0, 1], ["0.00", "1.00"]],
    ["0.00", [1, 1], ["0.00", "0.00"]],
    ["99.99", [1], ["99.99"]],
  ] as const)("allocates %s for %j", (amount, days, expected) =>
    expect(
      allocateByPersonDays(
        amount,
        days.map((d, i) => ({ id: String(i), days: d })),
      ).map((r) => r.actualShare),
    ).toEqual(expected),
  );
  it.each([-1, 0.5, NaN, Infinity])("rejects invalid days %s", (days) =>
    expect(() => allocateByPersonDays("1.00", [{ id: "A", days }])).toThrow(),
  );
  it("rejects zero weight", () =>
    expect(() =>
      allocateByPersonDays("1.00", [{ id: "A", days: 0 }]),
    ).toThrow());
  it("conserves varied large and small totals", () => {
    for (let n = 1; n <= 25; n++)
      for (const amount of ["0.01", "100.00", "999999999999.99"]) {
        const rows = allocateByPersonDays(
          amount,
          Array.from({ length: n }, (_, i) => ({
            id: `tenant-${i}`,
            days: ((i * 7) % 31) + 1,
          })),
        );
        expect(
          rows
            .reduce((sum, r) => sum.plus(r.actualShare), new MoneyDecimal(0))
            .equals(amount),
        ).toBe(true);
        expect(
          rows.every((r) => r.remainderCents === 0 || r.remainderCents === 1),
        ).toBe(true);
      }
  });
});

describe("independent integer-cent invariants", () => {
  it("accounts for every remainder cent and bounds rounding error", () => {
    for (const amount of ["0.01", "100.00", "999999999999.99"]) {
      const weights = [1, 2, 7, 19, 31];
      const people = weights.map((days, i) => ({ id: String(i), days }));
      const totalCents = BigInt(amount.replace(".", ""));
      const denominator = BigInt(weights.reduce((a, b) => a + b, 0));
      const rows = allocateByPersonDays(amount, people);
      let floors = BigInt(0);
      rows.forEach((row, i) => {
        const floor = (totalCents * BigInt(weights[i])) / denominator;
        const assigned = BigInt(row.actualShare.replace(".", ""));
        floors += floor;
        expect(assigned - floor).toBe(BigInt(row.remainderCents));
        expect(assigned >= floor && assigned <= floor + BigInt(1)).toBe(true);
      });
      expect(
        BigInt(rows.reduce((sum, row) => sum + row.remainderCents, 0)),
      ).toBe(totalCents - floors);
      expect(
        allocateByPersonDays(amount, [...people].reverse()).sort((a, b) =>
          a.id < b.id ? -1 : 1,
        ),
      ).toEqual(rows);
    }
  });
});
