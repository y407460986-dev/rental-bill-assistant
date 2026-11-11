import { MoneyDecimal } from "@/lib/utils/decimal";

export interface CheckoutCharge {
  confirmedAt: string | null;
  paid: boolean;
  currency: string;
  netAmountDue: string;
}
export type CheckoutAction =
  "confirm" | "pay" | "continue" | "query" | "complete";
export type CheckoutPhase = "idle" | "checking" | "completing" | "redirecting";
export interface CheckoutSnapshot<T extends CheckoutCharge> {
  charge: T;
  status: string;
  phase: CheckoutPhase;
}
interface PaymentResult {
  status: string;
  approvalUrl?: string | null;
}
export interface CheckoutContext {
  isCurrent: () => boolean;
}
export interface CheckoutController<T extends CheckoutCharge> {
  getSnapshot: () => CheckoutSnapshot<T>;
  read: (context: CheckoutContext, completeApproved?: boolean) => Promise<void>;
  act: (context: CheckoutContext) => Promise<void>;
}
interface CheckoutApi<T extends CheckoutCharge> {
  getCharge: () => Promise<T>;
  getPayment: () => Promise<PaymentResult>;
  createPayment: () => Promise<PaymentResult>;
  capturePayment: () => Promise<PaymentResult>;
  redirect: (url: string) => void;
  onChange: (snapshot: CheckoutSnapshot<T>) => void;
}
function payable(charge: CheckoutCharge) {
  const amount = new MoneyDecimal(charge.netAmountDue);
  return amount.isFinite() && amount.gt(0);
}
export function checkoutAction(
  charge: CheckoutCharge,
  status: string,
): CheckoutAction | null {
  if (charge.paid || status === "COMPLETED") return null;
  if (!charge.confirmedAt) return "confirm";
  if (!payable(charge)) return null;
  if (status === "UNPAID" || status === "ORDER_NOT_CREATED") return "pay";
  if (["CREATED", "SAVED", "PAYER_ACTION_REQUIRED", "PENDING"].includes(status))
    return "continue";
  if (status === "APPROVED") return "complete";
  return "query";
}

/** One controller per authorized charge load; URLs never establish payment state. */
export function createCheckoutController<T extends CheckoutCharge>(
  charge: T,
  api: CheckoutApi<T>,
): CheckoutController<T> {
  let snapshot: CheckoutSnapshot<T> = {
    charge,
    status: charge.paid ? "COMPLETED" : "UNKNOWN",
    phase: "idle",
  };
  let running = false;
  function update(
    context: CheckoutContext,
    patch: Partial<CheckoutSnapshot<T>>,
  ) {
    if (!context.isCurrent()) return;
    snapshot = { ...snapshot, ...patch };
    api.onChange(snapshot);
  }
  function completed(context: CheckoutContext) {
    update(context, {
      status: "COMPLETED",
      charge: { ...snapshot.charge, paid: true },
    });
  }
  async function refreshCharge(context: CheckoutContext) {
    if (!context.isCurrent()) return;
    const current = await api.getCharge();
    // A stale detail snapshot must not undo a verified payment result.
    update(context, {
      charge:
        snapshot.status === "COMPLETED" ? { ...current, paid: true } : current,
    });
  }
  async function capture(context: CheckoutContext) {
    if (!context.isCurrent()) return;
    update(context, { phase: "completing" });
    const result = await api.capturePayment();
    if (!context.isCurrent()) return;
    if (result.status !== "COMPLETED") throw new Error("PAYMENT_NOT_COMPLETED");
    // Lock repayment before the detail refresh, which may fail independently.
    completed(context);
    await refreshCharge(context);
  }
  async function read(context: CheckoutContext, completeApproved: boolean) {
    if (!context.isCurrent()) return;
    if (snapshot.status === "COMPLETED") {
      await refreshCharge(context);
      return;
    }
    update(context, { phase: "checking" });
    let result: PaymentResult;
    try {
      result = await api.getPayment();
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_CREATED") {
        update(context, { status: "ORDER_NOT_CREATED" });
        return;
      }
      throw error;
    }
    if (!context.isCurrent()) return;
    update(context, { status: result.status });
    if (result.status === "COMPLETED") {
      completed(context);
      await refreshCharge(context);
    } else if (
      completeApproved &&
      result.status === "APPROVED" &&
      snapshot.charge.confirmedAt &&
      !snapshot.charge.paid &&
      payable(snapshot.charge)
    ) {
      // This GET is authoritative; neither a redirect token nor create response is.
      // A single invocation can capture only once, with no re-entrant load/retry.
      await capture(context);
    }
  }
  async function start(context: CheckoutContext) {
    update(context, { status: "UNKNOWN", phase: "checking" });
    let result: PaymentResult;
    try {
      // The server reuses its persisted pending order and idempotency key.
      result = await api.createPayment();
    } catch (error) {
      if (error instanceof Error && error.message === "ALREADY_PAID") {
        completed(context);
        await refreshCharge(context);
        return;
      }
      throw error;
    }
    if (!context.isCurrent()) return;
    if (
      result.approvalUrl &&
      ["CREATED", "SAVED", "PAYER_ACTION_REQUIRED", "PENDING"].includes(
        result.status,
      )
    ) {
      update(context, { status: result.status, phase: "redirecting" });
      api.redirect(result.approvalUrl);
      return;
    }
    // Even a create response saying COMPLETED must pass the verifying GET.
    await read(context, true);
  }
  function getSnapshot(): CheckoutSnapshot<T> {
    return snapshot;
  }
  async function perform(
    context: CheckoutContext,
    action: () => Promise<void>,
  ) {
    if (running || !context.isCurrent() || snapshot.phase === "redirecting")
      return;
    running = true;
    try {
      await action();
    } catch (error) {
      if (snapshot.status !== "COMPLETED")
        update(context, { status: "UNKNOWN", phase: "idle" });
      throw error;
    } finally {
      running = false;
      if (getSnapshot().phase !== "redirecting")
        update(context, { phase: "idle" });
    }
  }
  return {
    getSnapshot,
    read: (context: CheckoutContext, completeApproved = false) =>
      perform(context, () => read(context, completeApproved)),
    act: (context: CheckoutContext) =>
      perform(context, async () => {
        const action = checkoutAction(snapshot.charge, snapshot.status);
        if (action === "query") await read(context, false);
        else if (action === "complete") await read(context, true);
        else if (action === "pay" || action === "continue")
          await start(context);
      }),
  };
}
