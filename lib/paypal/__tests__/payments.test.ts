import { beforeEach, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
const f = vi.hoisted(() => ({
  owned: vi.fn(),
  provider: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  current: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/access", () => ({ ownedCharge: f.owned }));
vi.mock("../client", () => ({ paypal: f.provider }));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    const db = {
      paymentAttempt: {
        create: f.create,
        findMany: f.find,
        findUniqueOrThrow: f.current,
        update: f.update,
      },
      $queryRaw: f.query,
    };
    return {
      ...db,
      $transaction: (fn: (db: unknown) => unknown) => f.transaction(fn, db),
    };
  },
}));
import { createPayment, capturePayment } from "../payments";
const attempt = {
  id: "attempt",
  chargeId: "charge",
  status: "PENDING",
  amount: new Prisma.Decimal("72.00"),
  payeeMerchantId: "merchant",
  idempotencyKey: "create-stable",
  captureRequestKey: "capture-stable",
  paypalOrderId: null as string | null,
  createdAt: new Date(),
};
function charge() {
  return {
    id: "charge",
    currency: "EUR",
    confirmedAt: new Date(),
    netAmountDue: new Prisma.Decimal("72.00"),
    paymentAttempts: [{ ...attempt }],
  };
}
function order(status = "COMPLETED") {
  return {
    id: "order",
    status,
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
beforeEach(() => {
  vi.resetAllMocks();
  f.transaction.mockImplementation((fn, db) => fn(db));
  vi.stubEnv("PAYPAL_MERCHANT_ID", "merchant");
  vi.stubEnv("APP_BASE_URL", "https://demo.example");
  f.owned.mockResolvedValue(charge());
  f.find.mockResolvedValue([{ ...attempt }]);
  f.current.mockResolvedValue({ ...attempt });
  f.update.mockResolvedValue({});
});
it("reuses the persisted create request key after uncertain provider failure", async () => {
  f.provider
    .mockRejectedValueOnce(new Error("network timeout"))
    .mockResolvedValueOnce({
      id: "order",
      status: "CREATED",
      links: [
        {
          rel: "approve",
          href: "https://www.sandbox.paypal.com/checkoutnow?token=order",
        },
      ],
    });
  await expect(createPayment("charge", "tenant")).rejects.toThrow();
  await createPayment("charge", "tenant");
  expect(f.provider.mock.calls.map((c) => c[3])).toEqual([
    "create-stable",
    "create-stable",
  ]);
  expect(f.create).not.toHaveBeenCalled();
});
it("reuses an existing pending order instead of creating a new one", async () => {
  f.find.mockResolvedValue([{ ...attempt, paypalOrderId: "order" }]);
  f.provider.mockResolvedValue({ id: "order", status: "APPROVED" });
  await createPayment("charge", "tenant");
  expect(f.provider).toHaveBeenCalledWith("/v2/checkout/orders/order");
  expect(f.create).not.toHaveBeenCalled();
});
it("charges in the statement currency instead of hard-coded EUR", async () => {
  f.owned.mockResolvedValue({ ...charge(), currency: "USD" });
  f.find.mockResolvedValue([{ ...attempt, paypalOrderId: null }]);
  f.provider.mockResolvedValue({ id: "order", status: "CREATED" });
  await createPayment("charge", "tenant");
  const body = f.provider.mock.calls.find(
    (c) => c[0] === "/v2/checkout/orders",
  )?.[2];
  expect(body.purchase_units[0].amount).toEqual({
    currency_code: "USD",
    value: "72.00",
  });
});
it("formats zero-decimal currencies without cents", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    currency: "JPY",
    netAmountDue: new Prisma.Decimal("1500"),
  });
  f.find.mockResolvedValue([
    { ...attempt, amount: new Prisma.Decimal("1500"), paypalOrderId: null },
  ]);
  f.provider.mockResolvedValue({ id: "order", status: "CREATED" });
  await createPayment("charge", "tenant");
  const body = f.provider.mock.calls.find(
    (c) => c[0] === "/v2/checkout/orders",
  )?.[2];
  expect(body.purchase_units[0].amount).toEqual({
    currency_code: "JPY",
    value: "1500",
  });
});
it("rejects fractional amounts in zero-decimal currencies before ordering", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    currency: "JPY",
    netAmountDue: new Prisma.Decimal("1500.50"),
  });
  await expect(createPayment("charge", "tenant")).rejects.toMatchObject({
    code: "AMOUNT_PRECISION_UNSUPPORTED",
  });
  expect(f.provider).not.toHaveBeenCalled();
});
it("rejects already paid and unconfirmed charges", async () => {
  f.find.mockResolvedValue([{ ...attempt, status: "COMPLETED" }]);
  await expect(createPayment("charge", "tenant")).rejects.toMatchObject({
    code: "ALREADY_PAID",
  });
  f.owned.mockResolvedValue({ ...charge(), confirmedAt: null });
  await expect(createPayment("charge", "tenant")).rejects.toMatchObject({
    code: "CONFIRM_FIRST",
  });
  expect(f.provider).not.toHaveBeenCalled();
});
it("rejects a settled owned charge before configuration or transaction acquisition", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    paymentAttempts: [{ ...attempt, status: "COMPLETED" }],
  });
  vi.stubEnv("PAYPAL_MERCHANT_ID", "");

  await expect(createPayment("charge", "tenant")).rejects.toMatchObject({
    status: 409,
    code: "ALREADY_PAID",
  });
  expect(f.owned).toHaveBeenCalledWith("charge", "tenant");
  expect(f.transaction).not.toHaveBeenCalled();
  expect(f.query).not.toHaveBeenCalled();
  expect(f.find).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
  expect(f.provider).not.toHaveBeenCalled();
});
it("queries an existing completed capture to recover a lost database write", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    paymentAttempts: [{ ...attempt, paypalOrderId: "order" }],
  });
  f.provider.mockResolvedValue(order());
  expect(await capturePayment("charge", "tenant", false)).toMatchObject({
    status: "COMPLETED",
    captureId: "capture",
  });
  expect(f.provider).toHaveBeenCalledTimes(1);
  expect(f.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "COMPLETED",
        paypalCaptureId: "capture",
      }),
    }),
  );
});
it("capture retries reuse a different stable operation key", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    paymentAttempts: [{ ...attempt, paypalOrderId: "order" }],
  });
  f.provider
    .mockResolvedValueOnce(order("APPROVED"))
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce(order("APPROVED"))
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce(order());
  await expect(capturePayment("charge", "tenant", true)).rejects.toThrow();
  expect(f.update).not.toHaveBeenCalled();
  await capturePayment("charge", "tenant", true);
  const requests = f.provider.mock.calls.filter((c) => c[1] === "POST");
  expect(requests.map((c) => c[3])).toEqual([
    "capture-stable",
    "capture-stable",
  ]);
});
it("wrong merchant capture never marks paid", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    paymentAttempts: [{ ...attempt, paypalOrderId: "order" }],
  });
  const raw = order();
  raw.purchase_units[0].payee.merchant_id = "attacker";
  f.provider.mockResolvedValue(raw);
  await expect(capturePayment("charge", "tenant", false)).rejects.toThrow();
  expect(f.update).not.toHaveBeenCalled();
});
it("preserves the first completion when another request finalizes during provider IO", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    paymentAttempts: [{ ...attempt, paypalOrderId: "order" }],
  });
  f.provider.mockResolvedValue(order());
  f.current.mockResolvedValue({
    ...attempt,
    status: "COMPLETED",
    paypalCaptureId: "capture",
    completedAt: new Date("2026-10-23T10:00:00Z"),
    verifiedAt: new Date("2026-10-23T10:00:00Z"),
  });

  expect(await capturePayment("charge", "tenant", false)).toEqual({
    status: "COMPLETED",
    captureId: "capture",
  });
  expect(f.current).toHaveBeenCalledWith({ where: { id: "attempt" } });
  expect(f.update).not.toHaveBeenCalled();
  expect(f.provider).toHaveBeenCalledTimes(1);
});
it("rejects a conflicting capture found after acquiring the completion lock", async () => {
  f.owned.mockResolvedValue({
    ...charge(),
    paymentAttempts: [{ ...attempt, paypalOrderId: "order" }],
  });
  f.provider.mockResolvedValue(order());
  f.current.mockResolvedValue({
    ...attempt,
    status: "COMPLETED",
    paypalCaptureId: "different-capture",
  });

  await expect(capturePayment("charge", "tenant", false)).rejects.toMatchObject(
    {
      code: "CAPTURE_MISMATCH",
    },
  );
  expect(f.update).not.toHaveBeenCalled();
});
