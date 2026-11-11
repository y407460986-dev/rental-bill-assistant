import { describe, it, expect } from "vitest";
import { verifiedCapture } from "../verify";
const expected = {
  orderId: "order",
  chargeId: "charge",
  merchantId: "merchant",
  amount: "72.00",
  currency: "EUR",
};
function order() {
  return {
    id: "order",
    status: "COMPLETED",
    purchase_units: [
      {
        custom_id: "charge",
        payee: { merchant_id: "merchant" },
        amount: { currency_code: "EUR", value: "72.00" },
        payments: {
          captures: [
            {
              id: "capture",
              status: "COMPLETED",
              amount: { currency_code: "EUR", value: "72.00" },
            },
          ],
        },
      },
    ],
  };
}
describe("server verified payment", () => {
  it("accepts a bound completed capture", () =>
    expect(verifiedCapture(order(), expected)).toBe("capture"));
  it("does not treat buyer approval as paid", () =>
    expect(() =>
      verifiedCapture({ ...order(), status: "APPROVED" }, expected),
    ).toThrow());
  it.each(["orderId", "chargeId", "merchantId", "amount", "currency"] as const)(
    "rejects wrong %s",
    (field) => {
      expect(() =>
        verifiedCapture(order(), { ...expected, [field]: "different" }),
      ).toThrow();
    },
  );
  it("rejects wrong capture currency", () => {
    const value = order();
    value.purchase_units[0].payments.captures[0].amount.currency_code = "USD";
    expect(() => verifiedCapture(value, expected)).toThrow();
  });
  it("rejects non-completed captures and duplicate captures", () => {
    const value = order();
    value.purchase_units[0].payments.captures[0].status = "PENDING";
    expect(() => verifiedCapture(value, expected)).toThrow();
    value.purchase_units[0].payments.captures.push(
      value.purchase_units[0].payments.captures[0],
    );
    expect(() => verifiedCapture(value, expected)).toThrow();
  });
});
