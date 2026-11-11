import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { env, must } from "@/lib/http";
import { ownedCharge } from "@/lib/billing/access";
import { currencyDecimals } from "@/lib/utils/currency";
import { paypal } from "./client";
import { verifiedCapture } from "./verify";
export async function createPayment(id: string, tenantId: string) {
  const charge = await ownedCharge(id, tenantId);
  must(charge.confirmedAt, "CONFIRM_FIRST");
  must(charge.netAmountDue.gt(0), "PAYMENT_NOT_REQUIRED");
  // Zero-decimal currencies (JPY, HUF, TWD, ...) must not carry cents: PayPal
  // rejects fractional amounts, so fail here before any order exists.
  const decimals = currencyDecimals(charge.currency);
  must(
    decimals > 0 || charge.netAmountDue.isInteger(),
    "AMOUNT_PRECISION_UNSUPPORTED",
  );
  must(
    !charge.paymentAttempts.some((a) => a.status === "COMPLETED"),
    "ALREADY_PAID",
  );
  const merchant = env("PAYPAL_MERCHANT_ID");
  const attempt = await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Charge" WHERE id=${id} FOR UPDATE`;
    const existing = await tx.paymentAttempt.findMany({
      where: { chargeId: id },
    });
    must(!existing.some((a) => a.status === "COMPLETED"), "ALREADY_PAID");
    const pending = existing.find((a) => a.status === "PENDING");
    if (pending) return pending;
    return tx.paymentAttempt.create({
      data: {
        chargeId: id,
        amount: charge.netAmountDue,
        currency: charge.currency,
        payeeMerchantId: merchant,
        idempotencyKey: randomUUID(),
        captureRequestKey: randomUUID(),
      },
    });
  });
  must(attempt.payeeMerchantId === merchant, "MERCHANT_CONFIGURATION_CHANGED");
  const root = new URL(env("APP_BASE_URL"));
  const target = new URL("/tenant/charges/" + id, root).href;
  let order;
  if (attempt.paypalOrderId)
    order = await paypal("/v2/checkout/orders/" + attempt.paypalOrderId);
  else {
    must(
      Date.now() - attempt.createdAt.getTime() < 5 * 60 * 60 * 1000,
      "ORDER_OUTCOME_UNKNOWN_CONTACT_ORGANIZER",
    );
    order = await paypal(
      "/v2/checkout/orders",
      "POST",
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: id,
            amount: {
              currency_code: charge.currency,
              value: attempt.amount.toFixed(decimals),
            },
            payee: { merchant_id: merchant },
            description: "Rental utility Sandbox payment",
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: target,
              cancel_url: target + "?cancelled=1",
              user_action: "PAY_NOW",
            },
          },
        },
      },
      attempt.idempotencyKey,
    );
    must(typeof order.id === "string", "PAYPAL_ORDER_INVALID", 502);
    await getDb().paymentAttempt.update({
      where: { id: attempt.id },
      data: { paypalOrderId: order.id },
    });
  }
  const approval = order.links?.find((link: { rel: string }) =>
    ["approve", "payer-action"].includes(link.rel),
  )?.href;
  if (approval)
    must(
      new URL(approval).hostname === "www.sandbox.paypal.com" ||
        new URL(approval).hostname === "sandbox.paypal.com",
      "PAYPAL_LINK_INVALID",
      502,
    );
  return {
    orderId: order.id,
    approvalUrl: approval || null,
    status: order.status,
  };
}
export async function capturePayment(
  id: string,
  tenantId: string,
  shouldCapture: boolean,
) {
  const charge = await ownedCharge(id, tenantId);
  const attempt =
    charge.paymentAttempts.find((a) => a.status === "COMPLETED") ||
    charge.paymentAttempts.find((a) => a.status === "PENDING");
  if (!attempt) return { status: "UNPAID" };
  if (attempt.status === "COMPLETED")
    return { status: "COMPLETED", captureId: attempt.paypalCaptureId };
  must(attempt.paypalOrderId, "ORDER_NOT_CREATED");
  let order = await paypal("/v2/checkout/orders/" + attempt.paypalOrderId);
  if (shouldCapture && order.status === "APPROVED") {
    must(charge.confirmedAt, "CONFIRM_FIRST");
    await paypal(
      "/v2/checkout/orders/" + attempt.paypalOrderId + "/capture",
      "POST",
      {},
      attempt.captureRequestKey,
    );
    order = await paypal("/v2/checkout/orders/" + attempt.paypalOrderId);
  }
  if (order.status !== "COMPLETED") return { status: order.status };
  const captureId = verifiedCapture(order, {
    orderId: attempt.paypalOrderId,
    chargeId: id,
    merchantId: attempt.payeeMerchantId,
    amount: charge.netAmountDue.toFixed(2),
    currency: charge.currency,
  });
  await getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Charge" WHERE id=${id} FOR UPDATE`;
    const current = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    if (current.status === "COMPLETED") {
      must(current.paypalCaptureId === captureId, "CAPTURE_MISMATCH");
      return;
    }
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "COMPLETED",
        paypalCaptureId: captureId,
        completedAt: new Date(),
        verifiedAt: new Date(),
      },
    });
  });
  return { status: "COMPLETED", captureId };
}
