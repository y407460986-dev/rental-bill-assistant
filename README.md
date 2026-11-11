# Rental Bill Assistant

**AI shared-housing bill splitting, paid with PayPal.** Built for the PayPal AI Hackathon 2026.

Live demo: **https://live-amber-six.vercel.app** (PayPal **Sandbox** only, no real money moves)

> Developed Oct 18 – Nov 10, 2026 in a private repository and squashed into a single commit for publication.

## The problem

In shared flats, one person (often the landlord or main tenant) receives the electricity bill and has to work out who owes what. People move in and out mid-period, and bills arrive in foreign languages with confusing tables. Then everyone has to be chased for money. The usual results are spreadsheets, arguments and late payments.

## What it does

Rental Bill Assistant covers the whole loop from finding a room to settling the utility bill:

1. **Find and rent a room.** Renters search by city, budget and home type, or describe what they want in plain language. **DeepSeek** turns the description into structured filters, with a disclosed keyword fallback. Landlords publish listings with an explicit electricity-sharing policy, and tenants apply. Approval creates a tenancy with exact move-in/move-out dates.
2. **Upload a bill and let AI read it.** The landlord uploads a photo of a utility statement. A **DeepSeek vision model** extracts the currency, totals, advance payments, amount due, service period and line items, together with the source evidence for each field.
3. **Double-check the AI.** An on-server **Tesseract OCR gate** re-reads the original image and compares the AI's amounts with the printed figures. Mismatches, missing service dates or inconsistent tax lines block automatic publication and send the bill to human review. The AI never silently "fixes" a bill.
4. **Split deterministically.** The amount due is allocated by **person-days** of each tenancy using `decimal.js` with exact rounding rules. Days nobody occupied are charged to the landlord. Money calculations never go through the AI.
5. **Pay with PayPal.** Each tenant sees their own charge with a per-day breakdown, confirms it, and pays with **PayPal Checkout (Orders v2, Sandbox)**. The server creates the order with an idempotent `PayPal-Request-Id`, captures it after approval, and then **re-reads the order** to verify status, merchant, currency, amount and `custom_id` before marking the charge _Paid_. URL parameters are never trusted as proof of payment.

## How PayPal is used

- OAuth2 client-credentials token, plus `POST /v2/checkout/orders`, `GET /v2/checkout/orders/{id}` and `POST /v2/checkout/orders/{id}/capture` (`lib/paypal/`)
- Idempotency keys per payment attempt, recovery queries for uncertain results, and locking against double payment
- Server-side verification of the captured order (`lib/paypal/verify.ts`)
- Any ISO 4217 currency PayPal accepts. Zero-decimal currencies (e.g. JPY) are sent without decimals; see `docs/evidence/jpy-capture/` for a Sandbox JPY capture.
- A hard Sandbox-only guard (`PAYPAL_ENVIRONMENT=sandbox`)

## How AI is used

| Where                                                           | Model / tool                       | What it does                                                                        |
| --------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Bill extraction (`lib/ai/extract.ts`)                           | DeepSeek vision (`deepseek-flash`) | Structured JSON extraction of amounts, dates and line items with per-field evidence |
| Extraction verification (`lib/ai/ocr-read.ts`, `ocr-verify.ts`) | Tesseract.js (offline `eng` data)  | Independent OCR cross-check of every extracted amount; mismatches force review      |
| Rental search (`lib/ai/rental-search.ts`)                       | DeepSeek text (`deepseek-flash`)   | Natural-language search turned into structured filters                              |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · Supabase (PostgreSQL, Auth, private Storage) · DeepSeek API · Tesseract.js · decimal.js · Zod · PayPal REST API (Sandbox) · Vercel

## Run locally

Requirements: Node.js 22.9 or newer (24 recommended), a Supabase project (or any PostgreSQL plus Supabase Auth/Storage), a DeepSeek API key, and a PayPal **Sandbox** REST app.

```bash
npm ci                    # also runs prisma generate
cp .env.example .env      # fill in your own values; never commit .env
npm run db:deploy         # apply Prisma migrations to your database
npm run demo:storage      # create the private bill-evidence bucket
npm run seed:demo         # create demo landlord/tenant accounts (uses DEMO_ACCOUNT_PASSWORD)
npm run dev               # http://localhost:3000
```

`.env.example` documents every variable. `APP_BASE_URL` must match the browser origin. `PAYPAL_ENVIRONMENT` must be `sandbox`. Database URLs and the Supabase service-role key are server-only.

A clearly marked synthetic electricity statement for testing is in `public/demo/synthetic-electricity.png`.

## Checks

```bash
npm test            # unit tests (database integration suites need a migrated test DB in DATABASE_URL)
npm run lint
npm run type-check
npm run build
```

## Project layout

- `app/`: pages and API routes (listings, applications, bill upload/review, tenant charges, PayPal actions)
- `lib/ai/`: DeepSeek extraction, OCR verification, AI rental search
- `lib/calculator/`: deterministic person-day allocation
- `lib/billing/`, `lib/contracts/`: bill workflow, reconciliation and review rules
- `lib/paypal/`: PayPal client, checkout, capture and verification
- `prisma/`: schema and migrations

## Limitations

This is a hackathon prototype. Payments run in PayPal Sandbox only, rent is displayed but not collected, and some billing cases (multiple occupancy intervals per person, general prepayment offsets, revising published bills) are deliberately blocked rather than guessed.

## License

MIT, see [LICENSE](LICENSE). Third-party design resources and photos are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
