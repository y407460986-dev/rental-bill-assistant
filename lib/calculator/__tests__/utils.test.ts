import { describe, it, expect } from "vitest";
import {
  calendarDays,
  intersectPeriods,
  coveredDays,
  validatePeriod,
  isCalendarDate,
} from "../../utils/date";
import {
  parseCurrencyInput,
  formatCurrency,
  formatAmount,
} from "../../utils/currency";
import { distributeRemainder, AmountMismatchError } from "../../utils/decimal";
describe("calendar dates", () => {
  it.each([
    ["2026-09-01", "2026-10-01", 30],
    ["2011-12-29", "2011-12-31", 2],
    ["2024-02-28", "2024-03-01", 2],
    ["2025-02-28", "2025-03-01", 1],
    ["2025-12-31", "2026-01-02", 2],
    ["2026-03-07", "2026-03-10", 3],
    ["2026-11-01", "2026-11-03", 2],
  ])("counts %s to %s", (a, b, n) => expect(calendarDays(a, b)).toBe(n));
  it.each([
    "2026-02-29",
    "2024-13-01",
    "2026-04-31",
    "x",
    "2026-1-01",
    "0000-01-01",
  ])("rejects date %s", (d) => expect(isCalendarDate(d)).toBe(false));
  it("rejects empty intervals", () =>
    expect(() => validatePeriod("2026-01-01", "2026-01-01")).toThrow());
  it("rejects invalid raw date", () =>
    expect(() => calendarDays("bad", "2026-01-01")).toThrow());
  it("clips and excludes adjacent dates", () => {
    expect(
      intersectPeriods("2026-09-01", "2026-10-01", "2026-09-16", null),
    ).toBe(15);
    expect(
      intersectPeriods("2026-09-01", "2026-10-01", "2026-08-01", "2026-09-01"),
    ).toBe(0);
    expect(
      intersectPeriods("2026-09-01", "2026-10-01", "2026-08-01", "2026-11-01"),
    ).toBe(30);
  });
  it("rejects bad occupancy", () =>
    expect(() =>
      intersectPeriods("2026-09-01", "2026-10-01", "bad", null),
    ).toThrow());
  it("unions overlaps without losing vacancies", () => {
    expect(
      coveredDays("2026-09-01", "2026-10-01", [
        { start: "2026-09-01", end: "2026-09-10" },
        { start: "2026-09-05", end: "2026-09-15" },
        { start: "2026-09-20", end: null },
      ]),
    ).toBe(25);
    expect(coveredDays("2026-09-01", "2026-10-01", [])).toBe(0);
    expect(
      coveredDays("2026-09-01", "2026-10-01", [
        { start: "2026-10-01", end: null },
      ]),
    ).toBe(0);
  });
  it("validates union inputs", () => {
    expect(() =>
      coveredDays("2026-09-01", "2026-10-01", [{ start: "bad", end: null }]),
    ).toThrow();
    expect(() =>
      coveredDays("2026-09-01", "2026-10-01", [
        { start: "2026-09-02", end: "2026-09-01" },
      ]),
    ).toThrow();
  });
});
describe("money utilities", () => {
  it.each([
    ["1.010,10", "de-DE", "1010.10"],
    ["859,58", "de-DE", "859.58"],
    ["1,010.10", "en-US", "1010.10"],
    ["0.00", "en-US", "0.00"],
  ] as const)("parses %s using %s", (s, l, e) =>
    expect(parseCurrencyInput(s, l)).toBe(e),
  );
  it.each(["1,00.10", "1.01,10", "-1,00", "1e2", "1,2"])(
    "rejects malformed %s",
    (s) => expect(() => parseCurrencyInput(s, "de-DE")).toThrow(),
  );
  it("formats currencies", () => {
    expect(formatCurrency("1010.10", "EUR", "de-DE")).toContain("1.010,10");
    expect(formatCurrency("10.00", "USD", "en-US")).toBe("$10.00");
  });
  it("rejects unsupported currency and amount", () => {
    expect(() => formatCurrency("x", "EUR", "en-US")).toThrow();
    expect(() => formatCurrency("1.00", "EURO" as "EUR", "en-US")).toThrow();
  });
  it("validates direct weight and money input", () => {
    expect(() =>
      distributeRemainder([{ id: "A", weight: "1" }], "NaN"),
    ).toThrow();
    expect(() =>
      distributeRemainder([{ id: "A", weight: "0.5" }], "1.00"),
    ).toThrow();
    expect(() =>
      distributeRemainder([{ id: "A", weight: "0" }], "1.00"),
    ).toThrow();
  });
  it("keeps zero weight from receiving cents", () =>
    expect(
      distributeRemainder(
        [
          { id: "A", weight: "0" },
          { id: "B", weight: "1" },
        ],
        "0.01",
      ).map((r) => r.actualShare),
    ).toEqual(["0.00", "0.01"]));
  it("exposes conservation errors", () =>
    expect(new AmountMismatchError("test").name).toBe("AmountMismatchError"));
});

describe("review regressions", () => {
  it("rejects undeclared parsing locales rather than treating them as English", () => {
    expect(() => parseCurrencyInput("1,010.10", "fr-FR" as "en-US")).toThrow();
  });

  it("formats zero-decimal currencies without fake cents", () => {
    expect(formatAmount("1500", "JPY", "en-US")).toBe("1,500");
    expect(formatAmount("1500.00", "JPY", "de-DE")).toBe("1.500");
    expect(formatCurrency("1500", "JPY", "en-US")).toContain("1,500");
    expect(formatCurrency("1500", "JPY", "en-US")).not.toContain(".00");
  });
  it("parses zero-decimal amounts printed without decimals", () => {
    expect(parseCurrencyInput("1.234", "de-DE", 0)).toBe("1234.00");
    expect(parseCurrencyInput("1,234", "en-US", 0)).toBe("1234.00");
    expect(() => parseCurrencyInput("12,34", "de-DE", 0)).toThrow();
  });
});
