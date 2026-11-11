import { z } from "zod";
import { MoneyDecimal } from "../utils/decimal";
export const OrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  purchase_units: z.array(
    z.object({
      custom_id: z.string(),
      payee: z.object({ merchant_id: z.string() }),
      amount: z.object({ currency_code: z.string(), value: z.string() }),
      payments: z
        .object({
          captures: z.array(
            z.object({
              id: z.string(),
              status: z.string(),
              amount: z.object({
                currency_code: z.string(),
                value: z.string(),
              }),
            }),
          ),
        })
        .optional(),
    }),
  ),
});
export function verifiedCapture(
  raw: unknown,
  expected: {
    orderId: string;
    chargeId: string;
    merchantId: string;
    amount: string;
    currency: string;
  },
) {
  const order = OrderSchema.parse(raw);
  if (
    order.id !== expected.orderId ||
    order.status !== "COMPLETED" ||
    order.purchase_units.length !== 1
  )
    throw new Error("ORDER_NOT_COMPLETED");
  const unit = order.purchase_units[0];
  const captures = unit.payments?.captures;
  if (
    unit.custom_id !== expected.chargeId ||
    unit.payee.merchant_id !== expected.merchantId ||
    unit.amount.currency_code !== expected.currency ||
    !new MoneyDecimal(unit.amount.value).equals(expected.amount) ||
    captures?.length !== 1
  )
    throw new Error("ORDER_BINDING_MISMATCH");
  const capture = captures[0];
  if (
    capture.status !== "COMPLETED" ||
    capture.amount.currency_code !== expected.currency ||
    !new MoneyDecimal(capture.amount.value).equals(expected.amount)
  )
    throw new Error("CAPTURE_MISMATCH");
  return capture.id;
}
