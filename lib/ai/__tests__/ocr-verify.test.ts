import { expect, it } from "vitest";
import { utilityStatement } from "../../testing/utility-statement";
import { observedStatement } from "../../testing/observed-statement";
import {
  amountsFromOcrText,
  formatAmountsForOcr,
  verifyExtractionAgainstOcr,
} from "../ocr-verify";

it("accepts printed German amounts that match the extraction", () => {
  const data = utilityStatement();
  const text =
    "Strom 877,60 163,50 1.014,10 Zusatzkosten 3,00 1,00 4,00 " +
    "Rechnungsbetrag 874,60 162,50 1.010,10 " +
    "Abschlaege 859,58 faellig 150,52 Abschlag 116,26";
  expect(amountsFromOcrText(text)).toEqual(
    new Set([
      "877.60",
      "163.50",
      "1014.10",
      "3.00",
      "1.00",
      "4.00",
      "874.60",
      "162.50",
      "1010.10",
      "859.58",
      "150.52",
      "116.26",
    ]),
  );
  expect(verifyExtractionAgainstOcr(data, text)).toEqual([]);
});

it("blocks amounts the model invented that are not on the page", () => {
  const data = utilityStatement();
  data.lineItems[0].gross = "1041.10";
  data.lineItems[0].tax = "163.50";
  data.lineItems[0].net = "877.60";
  const text =
    "Strom 877,60 163,50 1.014,10 Zusatzkosten 3,00 1,00 4,00 " +
    "Rechnungsbetrag 874,60 162,50 1.010,10 859,58 150,52 116,26";
  expect(verifyExtractionAgainstOcr(data, text)).toEqual([
    "OCR_AMOUNT_MISMATCH: lineItems[0].gross 1041.10",
  ]);
});

it("forces review when OCR finds too few printed amounts", () => {
  expect(verifyExtractionAgainstOcr(observedStatement(), "")).toEqual([
    "OCR_INCONCLUSIVE",
  ]);
  expect(verifyExtractionAgainstOcr(observedStatement(), "page 2")).toEqual([
    "OCR_INCONCLUSIVE",
  ]);
});

it("does not treat statement dates as amounts and accepts the 1.19 bill", () => {
  const data = observedStatement();
  const text = "Rechnungsdatum 02.10.2026 " + formatAmountsForOcr(data);
  expect(amountsFromOcrText(text).has("2.10")).toBe(false);
  expect(verifyExtractionAgainstOcr(data, text)).toEqual([]);
});
