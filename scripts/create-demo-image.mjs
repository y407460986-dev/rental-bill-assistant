import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><rect width="1200" height="1500" fill="#fff"/><rect x="60" y="60" width="1080" height="130" rx="8" fill="#fff0cf"/><g font-family="sans-serif" fill="#182f40"><text x="95" y="115" font-size="30" font-weight="bold">SYNTHETIC DEMO DOCUMENT - NOT A REAL BILL</text><text x="95" y="160" font-size="26">Fiktive Rechnung / Simulated electricity statement</text><text x="95" y="280" font-size="48" font-weight="bold">Stromabrechnung</text><text x="95" y="350" font-size="27">Demo House Berlin - fictional property</text><text x="95" y="420" font-size="28">Rechnungsdatum: 02.10.2026</text><text x="95" y="485" font-size="28">Leistungszeitraum: 01.09.2026 bis 30.09.2026 (inklusive)</text><path d="M95 550H1105" stroke="#adc4cd"/><text x="95" y="630" font-size="30">Stromkosten netto</text><text x="850" y="630" font-size="30">150,00 EUR</text><text x="95" y="700" font-size="30">Umsatzsteuer (20%, fiktiv)</text><text x="850" y="700" font-size="30">30,00 EUR</text><text x="95" y="780" font-size="32" font-weight="bold">Rechnungsbetrag brutto</text><text x="850" y="780" font-size="32">180,00 EUR</text><text x="95" y="860" font-size="28">Geleistete Abschlagszahlungen</text><text x="880" y="860" font-size="28">0,00 EUR</text><text x="95" y="940" font-size="32" font-weight="bold">Offener Betrag</text><text x="850" y="940" font-size="32">180,00 EUR</text><text x="95" y="1020" font-size="28">Naechster Abschlagsbetrag</text><text x="880" y="1020" font-size="28">0,00 EUR</text><text x="95" y="1170" font-size="25">No tenant prepayments. No bank account. No real provider.</text><text x="95" y="1220" font-size="25">All values, tax rates, dates and address are synthetic.</text><text x="95" y="1340" font-size="26" font-weight="bold">PayPal AI Hackathon - synthetic test evidence</text></g></svg>`;
await mkdir(new URL("../public/demo/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/demo/synthetic-electricity.svg", import.meta.url),
  svg,
);
await sharp(Buffer.from(svg))
  .png()
  .toFile(
    fileURLToPath(
      new URL("../public/demo/synthetic-electricity.png", import.meta.url),
    ),
  );
console.log("Synthetic statement generated");
