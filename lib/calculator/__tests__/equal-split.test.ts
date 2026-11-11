import { describe, it, expect } from "vitest";
import { allocateEqually } from "../equal-split";
describe("equal split", () => {
  it.each([
    ["100.00", ["A", "B", "C"], ["33.34", "33.33", "33.33"]],
    ["0.01", ["C", "B", "A"], ["0.00", "0.00", "0.01"]],
    ["0.02", ["C", "B", "A"], ["0.00", "0.01", "0.01"]],
    ["0.00", ["A", "B"], ["0.00", "0.00"]],
    ["19.99", ["A"], ["19.99"]],
  ] as const)("splits %s for %j", (amount, ids, expected) =>
    expect(allocateEqually(amount, [...ids]).map((r) => r.actualShare)).toEqual(
      expected,
    ),
  );
  it("rejects empty or repeated participants", () => {
    for (const ids of [[], ["A", "A"], [""]])
      expect(() => allocateEqually("1.00", ids)).toThrow();
  });
});
