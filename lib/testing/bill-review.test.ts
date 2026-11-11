import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BillReview, { type Version } from "@/components/ui/BillReview";
import { observedNotes, observedStatement } from "./observed-statement";

function render(
  version: Partial<Version> = {},
  pending = false,
  processing = false,
  leaseActive = false,
) {
  const v: Version = {
    id: "version",
    status: "READY",
    currency: "EUR",
    inputFingerprint: "fingerprint",
    reconciliationIssues: [],
    extractedLineItems: observedStatement(),
    charges: [
      {
        id: "charge",
        tenantId: "tenant",
        daysOccupied: 31,
        actualShare: "1.19",
      },
    ],
    ...version,
  };
  return renderToStaticMarkup(
    createElement(BillReview, {
      bill: {
        id: "bill",
        sourceDocument: { isSynthetic: true },
        processing: { status: "READY", errorCode: null, leaseUntil: null },
        versions: [v],
      },
      id: "bill",
      en: true,
      v,
      busy: pending,
      processing,
      leaseActive,
      canProcess: false,
      run: async () => {},
      processAndReload: async () => {},
      mutateAndReload: async () => {},
    }),
  );
}
const publishButton = (html: string) =>
  html.match(/<button[^>]*>Confirm and publish<\/button>/)?.[0];

describe("bill review notes and publish conditions", () => {
  it.each(["issues", "notes"] as const)(
    "does not disable a READY draft for informational %s",
    (field) => {
      const html = render({
        extractedLineItems: observedStatement(field),
        reconciliationIssues: field === "issues" ? observedNotes : [],
      });
      expect(html).toContain("Statement notes (not blocking)");
      for (const note of observedNotes) expect(html).toContain(note);
      expect(html).not.toContain("Review required; publishing blocked");
      expect(publishButton(html)).not.toContain("disabled");
      expect(html).toContain(
        "marked for non-production use, not as an actual supplier statement",
      );
    },
  );
  it("retains publication readiness safeguards even with notes only", () => {
    expect(publishButton(render({ status: "DRAFT" }))).toContain("disabled");
    expect(publishButton(render({}, true))).toContain("disabled");
  });
  it("offers saved-extraction generation for a legacy notes-only draft", () => {
    const { notes: _notes, ...legacy } = observedStatement("issues");
    void _notes;
    const html = render({
      status: "DRAFT",
      extractedLineItems: legacy,
      reconciliationIssues: observedNotes,
      charges: [],
    });
    expect(html).toContain("Generate charges from saved extraction");
    expect(html).not.toContain("Review required; publishing blocked");
  });
  it("blocks real discrepancies even if a saved version says READY", () => {
    const html = render({
      reconciliationIssues: [...observedNotes, "SETTLEMENT_MISMATCH"],
    });
    expect(html).toContain("Review required; publishing blocked");
    expect(publishButton(html)).toContain("disabled");
  });
  it("offers regeneration for legacy READY versions with pre-notes fingerprints", () => {
    const { notes: _notes, ...legacy } = observedStatement();
    void _notes;
    expect(render({ extractedLineItems: legacy })).toContain(
      "Regenerate charges from saved extraction",
    );
  });
  it("permits saved-extraction recovery after an interrupted processing lease expires", () => {
    const version = { status: "DRAFT" };
    const expired = render(version, false, true, false);
    const active = render(version, false, true, true);
    const action =
      /<button[^>]*>Generate charges from saved extraction<\/button>/;
    expect(expired.match(action)?.[0]).not.toContain("disabled");
    expect(active.match(action)?.[0]).toContain("disabled");
  });
});
