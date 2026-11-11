import { describe, expect, it, vi } from "vitest";
import {
  checkoutAction,
  createCheckoutController,
  type CheckoutCharge,
  type CheckoutSnapshot,
} from "../checkout";

function deferred<T>() {
  return Promise.withResolvers<T>();
}
function setup(overrides: Partial<CheckoutCharge> = {}) {
  const charge: CheckoutCharge = {
    confirmedAt: "2026-10-31T10:00:00Z",
    paid: false,
    currency: "EUR",
    netAmountDue: "1.19",
    ...overrides,
  };
  const changes: CheckoutSnapshot<CheckoutCharge>[] = [];
  const api = {
    getCharge: vi.fn(async () => ({ ...charge })),
    getPayment: vi.fn(async () => ({ status: "UNPAID" })),
    createPayment: vi
      .fn<() => Promise<{ status: string; approvalUrl?: string | null }>>()
      .mockResolvedValue({
        status: "CREATED",
        approvalUrl:
          "https://www.sandbox.paypal.com/checkoutnow?token=saved-order",
      }),
    capturePayment: vi.fn(async () => ({ status: "COMPLETED" })),
    redirect: vi.fn(),
    onChange: vi.fn((snapshot: CheckoutSnapshot<CheckoutCharge>) => {
      changes.push(snapshot);
    }),
  };
  let current = true;
  const context = { isCurrent: () => current };
  const controller = createCheckoutController(charge, api);
  return {
    charge,
    api,
    changes,
    context,
    controller,
    invalidate: () => {
      current = false;
    },
    action: () => {
      const snapshot = controller.getSnapshot();
      return checkoutAction(snapshot.charge, snapshot.status);
    },
  };
}

describe("payment checkout transitions", () => {
  it("requires confirmation before any payment action", async () => {
    const f = setup({ confirmedAt: null });
    f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
    await f.controller.read(f.context, true);
    expect(f.action()).toBe("confirm");
    expect(f.controller.getSnapshot().charge.paid).toBe(false);
    expect(f.api.capturePayment).not.toHaveBeenCalled();
    await f.controller.act(f.context);
    expect(f.api.createPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["UNPAID", "pay"],
    ["CREATED", "continue"],
    ["SAVED", "continue"],
    ["PAYER_ACTION_REQUIRED", "continue"],
    ["APPROVED", "complete"],
    ["VOIDED", "query"],
  ])("selects a single action for authoritative %s", async (status, action) => {
    const f = setup();
    f.api.getPayment.mockResolvedValue({ status });
    await f.controller.read(f.context);
    expect(f.action()).toBe(action);
    expect(f.api.capturePayment).not.toHaveBeenCalled();
  });

  it.each([
    { netAmountDue: "0.00" },
    { netAmountDue: "-1.00" },
    { netAmountDue: "NaN" },
  ])(
    "does not charge an ineligible amount or currency: %j",
    async (overrides) => {
      const f = setup(overrides);
      f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
      await f.controller.read(f.context, true);
      await f.controller.act(f.context);
      expect(f.action()).toBeNull();
      expect(f.api.createPayment).not.toHaveBeenCalled();
      expect(f.api.capturePayment).not.toHaveBeenCalled();
    },
  );

  it("completes one approved payment on load and locks before refreshing detail", async () => {
    const f = setup();
    const detail = deferred<CheckoutCharge>();
    const refreshing = deferred<void>();
    f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
    f.api.getCharge.mockImplementation(() => {
      refreshing.resolve();
      return detail.promise;
    });
    const pending = f.controller.read(f.context, true);
    await refreshing.promise;
    expect(f.controller.getSnapshot().status).toBe("COMPLETED");
    expect(f.action()).toBeNull();
    detail.resolve({ ...f.charge, paid: false });
    await pending;
    expect(f.controller.getSnapshot().charge.paid).toBe(true);
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
    expect(f.api.getPayment).toHaveBeenCalledOnce();
    await f.controller.act(f.context);
    expect(f.api.createPayment).not.toHaveBeenCalled();
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
  });

  it("retains verified completion if the subsequent detail reload fails", async () => {
    const f = setup();
    f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
    f.api.getCharge.mockRejectedValueOnce(new Error("detail unavailable"));
    await expect(f.controller.read(f.context, true)).rejects.toThrow(
      "detail unavailable",
    );
    expect(f.controller.getSnapshot()).toMatchObject({
      status: "COMPLETED",
      charge: { paid: true },
      phase: "idle",
    });
    expect(f.action()).toBeNull();
    await f.controller.act(f.context);
    await f.controller.read(f.context);
    expect(f.api.getCharge).toHaveBeenCalledTimes(2);
    expect(f.controller.getSnapshot().charge.paid).toBe(true);
    expect(f.api.createPayment).not.toHaveBeenCalled();
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
  });

  it("recovers a completed payment by read only, without capturing again", async () => {
    const f = setup();
    f.api.getPayment.mockResolvedValue({ status: "COMPLETED" });
    await f.controller.read(f.context, true);
    expect(f.action()).toBeNull();
    expect(f.controller.getSnapshot().charge.paid).toBe(true);
    expect(f.api.capturePayment).not.toHaveBeenCalled();
  });

  it("requires a read-only recovery before explicitly completing a failed capture", async () => {
    const f = setup();
    f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
    f.api.capturePayment.mockRejectedValueOnce(new Error("capture timeout"));
    await expect(f.controller.read(f.context, true)).rejects.toThrow(
      "capture timeout",
    );
    expect(f.action()).toBe("query");
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
    await f.controller.act(f.context);
    expect(f.action()).toBe("complete");
    expect(f.controller.getSnapshot().charge.paid).toBe(false);
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
    await f.controller.act(f.context);
    expect(f.api.capturePayment).toHaveBeenCalledTimes(2);
    expect(f.api.getPayment).toHaveBeenCalledTimes(3);
    expect(f.action()).toBeNull();
    expect(f.api.createPayment).not.toHaveBeenCalled();
  });

  it.each(["APPROVED", "PENDING"])(
    "does not retry a capture returning %s",
    async (status) => {
      const f = setup();
      f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
      f.api.capturePayment.mockResolvedValue({ status });
      await expect(f.controller.read(f.context, true)).rejects.toThrow(
        "PAYMENT_NOT_COMPLETED",
      );
      expect(f.action()).toBe("query");
      expect(f.controller.getSnapshot().charge.paid).toBe(false);
      expect(f.api.capturePayment).toHaveBeenCalledOnce();
      await f.controller.act(f.context);
      expect(f.api.capturePayment).toHaveBeenCalledOnce();
      expect(f.action()).toBe("complete");
    },
  );

  it("only reads while the outcome is unknown, then permits payment after UNPAID", async () => {
    const f = setup();
    f.api.getPayment.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(f.controller.read(f.context, true)).rejects.toThrow(
      "provider unavailable",
    );
    await f.controller.act(f.context);
    expect(f.action()).toBe("pay");
    expect(f.api.getPayment).toHaveBeenCalledTimes(2);
    expect(f.api.createPayment).not.toHaveBeenCalled();
    expect(f.api.capturePayment).not.toHaveBeenCalled();
  });

  it("continues a persisted order after unfinished approval", async () => {
    const f = setup();
    f.api.getPayment.mockResolvedValue({ status: "CREATED" });
    await f.controller.read(f.context, true);
    expect(f.action()).toBe("continue");
    await f.controller.act(f.context);
    expect(f.api.createPayment).toHaveBeenCalledOnce();
    expect(f.api.redirect).toHaveBeenCalledWith(
      "https://www.sandbox.paypal.com/checkoutnow?token=saved-order",
    );
    expect(f.api.capturePayment).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().phase).toBe("redirecting");
  });

  it("does not repeat uncertain creation before querying its saved outcome", async () => {
    const f = setup();
    await f.controller.read(f.context);
    f.api.createPayment.mockRejectedValueOnce(new Error("create timeout"));
    await expect(f.controller.act(f.context)).rejects.toThrow("create timeout");
    expect(f.action()).toBe("query");
    f.api.getPayment.mockRejectedValueOnce(new Error("ORDER_NOT_CREATED"));
    await f.controller.act(f.context);
    expect(f.action()).toBe("pay");
    expect(f.api.createPayment).toHaveBeenCalledOnce();
    await f.controller.act(f.context);
    expect(f.api.createPayment).toHaveBeenCalledTimes(2);
    expect(f.api.redirect).toHaveBeenCalledOnce();
  });

  it.each(["APPROVED", "COMPLETED"])(
    "verifies create status %s through GET before treating it as paid",
    async (status) => {
      const f = setup();
      await f.controller.read(f.context);
      f.api.createPayment.mockResolvedValue({ status });
      await f.controller.act(f.context);
      expect(f.api.getPayment).toHaveBeenCalledTimes(2);
      expect(f.controller.getSnapshot().status).toBe("UNPAID");
      expect(f.controller.getSnapshot().charge.paid).toBe(false);
      expect(f.api.capturePayment).not.toHaveBeenCalled();
      expect(f.api.redirect).not.toHaveBeenCalled();
    },
  );

  it("handles an already-paid race without enabling repayment after a refresh failure", async () => {
    const f = setup();
    await f.controller.read(f.context);
    f.api.createPayment.mockRejectedValueOnce(new Error("ALREADY_PAID"));
    f.api.getCharge.mockRejectedValueOnce(new Error("detail unavailable"));
    await expect(f.controller.act(f.context)).rejects.toThrow(
      "detail unavailable",
    );
    expect(f.action()).toBeNull();
    expect(f.controller.getSnapshot().status).toBe("COMPLETED");
    await f.controller.act(f.context);
    expect(f.api.createPayment).toHaveBeenCalledOnce();
    expect(f.api.capturePayment).not.toHaveBeenCalled();
  });

  it("propagates an access failure without creating or capturing payment", async () => {
    const f = setup();
    const forbidden = Object.assign(new Error("FORBIDDEN"), { status: 403 });
    f.api.getPayment.mockRejectedValue(forbidden);
    await expect(f.controller.read(f.context, true)).rejects.toBe(forbidden);
    expect(f.api.createPayment).not.toHaveBeenCalled();
    expect(f.api.capturePayment).not.toHaveBeenCalled();
  });
});

describe("checkout concurrency and navigation", () => {
  it("ignores overlapping actions while one approved load is pending", async () => {
    const f = setup();
    const payment = deferred<{ status: string }>();
    f.api.getPayment.mockReturnValue(payment.promise);
    const pending = f.controller.read(f.context, true);
    await f.controller.act(f.context);
    await f.controller.read(f.context, true);
    expect(f.api.getPayment).toHaveBeenCalledOnce();
    payment.resolve({ status: "APPROVED" });
    await pending;
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
    expect(f.api.createPayment).not.toHaveBeenCalled();
  });

  it("does not capture or publish a GET response after leaving the charge", async () => {
    const f = setup();
    const payment = deferred<{ status: string }>();
    f.api.getPayment.mockReturnValue(payment.promise);
    const pending = f.controller.read(f.context, true);
    f.changes.length = 0;
    f.invalidate();
    payment.resolve({ status: "APPROVED" });
    await pending;
    expect(f.changes).toEqual([]);
    expect(f.api.capturePayment).not.toHaveBeenCalled();
    expect(f.api.getCharge).not.toHaveBeenCalled();
  });

  it("does not redirect a late create response after navigation", async () => {
    const f = setup();
    await f.controller.read(f.context);
    const order = deferred<{ status: string; approvalUrl: string }>();
    f.api.createPayment.mockReturnValue(order.promise);
    const pending = f.controller.act(f.context);
    f.changes.length = 0;
    f.invalidate();
    order.resolve({
      status: "CREATED",
      approvalUrl:
        "https://www.sandbox.paypal.com/checkoutnow?token=saved-order",
    });
    await pending;
    expect(f.api.redirect).not.toHaveBeenCalled();
    expect(f.changes).toEqual([]);
    expect(f.api.getPayment).toHaveBeenCalledOnce();
  });

  it("does not repaint or reload private detail for a capture completed after navigation", async () => {
    const f = setup();
    const capture = deferred<{ status: string }>();
    const capturing = deferred<void>();
    f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
    f.api.capturePayment.mockImplementation(() => {
      capturing.resolve();
      return capture.promise;
    });
    const pending = f.controller.read(f.context, true);
    await capturing.promise;
    f.changes.length = 0;
    f.invalidate();
    capture.resolve({ status: "COMPLETED" });
    await pending;
    expect(f.changes).toEqual([]);
    expect(f.api.getCharge).not.toHaveBeenCalled();
  });

  it("restores query recovery if browser redirect throws", async () => {
    const f = setup();
    await f.controller.read(f.context);
    f.api.redirect.mockImplementation(() => {
      throw new Error("navigation unavailable");
    });
    await expect(f.controller.act(f.context)).rejects.toThrow(
      "navigation unavailable",
    );
    expect(f.action()).toBe("query");
    expect(f.controller.getSnapshot().phase).toBe("idle");
  });

  it("bounds duplicate pay actions while creating and redirecting", async () => {
    const f = setup();
    await f.controller.read(f.context);
    const order = deferred<{ status: string; approvalUrl: string }>();
    f.api.createPayment.mockReturnValue(order.promise);
    const pending = f.controller.act(f.context);
    await f.controller.act(f.context);
    expect(f.api.createPayment).toHaveBeenCalledOnce();
    order.resolve({
      status: "CREATED",
      approvalUrl:
        "https://www.sandbox.paypal.com/checkoutnow?token=saved-order",
    });
    await pending;
    await f.controller.act(f.context);
    expect(f.api.createPayment).toHaveBeenCalledOnce();
    expect(f.api.redirect).toHaveBeenCalledOnce();
  });

  it("completes a reused approved order only after authoritative GET approval", async () => {
    const f = setup();
    await f.controller.read(f.context);
    f.api.createPayment.mockResolvedValue({ status: "APPROVED" });
    f.api.getPayment.mockResolvedValue({ status: "APPROVED" });
    await f.controller.act(f.context);
    expect(f.api.getPayment).toHaveBeenCalledTimes(2);
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
    expect(f.action()).toBeNull();
    expect(f.api.redirect).not.toHaveBeenCalled();
  });

  it("recovers an uncertain capture through GET completion without a second capture", async () => {
    const f = setup();
    f.api.getPayment.mockResolvedValueOnce({ status: "APPROVED" });
    f.api.capturePayment.mockRejectedValueOnce(
      new Error("capture response lost"),
    );
    await expect(f.controller.read(f.context, true)).rejects.toThrow(
      "capture response lost",
    );
    f.api.getPayment.mockResolvedValue({ status: "COMPLETED" });
    await f.controller.act(f.context);
    expect(f.action()).toBeNull();
    expect(f.api.capturePayment).toHaveBeenCalledOnce();
    expect(f.api.createPayment).not.toHaveBeenCalled();
  });
});
