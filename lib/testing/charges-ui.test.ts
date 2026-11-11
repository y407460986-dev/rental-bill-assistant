import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import ChargesList, { type ChargeSummary } from "@/components/ui/ChargesList";
const charge: ChargeSummary = {
  id: "existing-paid-charge",
  daysOccupied: 30,
  netAmountDue: "60.21",
  currency: "EUR",
  confirmedAt: "2026-10-29",
  paymentAttempts: [{ status: "FAILED" }, { status: "COMPLETED" }],
  billVersion: {
    servicePeriodStart: "2026-09-01T00:00:00.000Z",
    servicePeriodEnd: "2026-10-01T00:00:00.000Z",
  },
};
describe("tenant bill list API compatibility", () => {
  it("reads nested service dates and completed attempts from the list API DTO", () => {
    const html = renderToStaticMarkup(
      createElement(ChargesList, {
        charges: [charge],
        en: true,
        loading: false,
        ready: true,
        onNavigate: () => {},
      }),
    );
    expect(html).toContain("Paid · View details");
    expect(html).toContain("2026-09-01");
    expect(html).toContain("2026-10-01");
    expect(html).toContain("60.21");
  });
  it("does not mark pending or cancelled attempts as paid", () => {
    const html = renderToStaticMarkup(
      createElement(ChargesList, {
        charges: [
          {
            ...charge,
            paymentAttempts: [{ status: "PENDING" }, { status: "CANCELLED" }],
          },
        ],
        en: true,
        loading: false,
        ready: true,
        onNavigate: () => {},
      }),
    );
    expect(html).toContain("Unpaid · View details");
    expect(html).not.toContain("Paid · View details");
  });
});
