# JPY capture evidence

PayPal Sandbox only. No real funds. Merchant `H7NSZ5HDLY7SE`.

## What was captured

| Run | Order               | Capture             | Amount   | Status    |
| --- | ------------------- | ------------------- | -------- | --------- |
| 1   | `1AF40716RK5773512` | `7DA20485R21098600` | JPY 3292 | COMPLETED |
| 2   | `7WB44320NU680553C` | `9LE981153K9514612` | JPY 3292 | COMPLETED |

Both runs used the project's own `verifiedCapture()` and passed all six checks:
order id, `COMPLETED` status, single purchase unit, `custom_id`, merchant id,
currency `JPY`, and amount equality. The second run was executed independently,
with a different payer, to show the result is repeatable.

`jp-capture-evidence.json` is the verbatim capture payload from run 1.

## What this proves

- PayPal accepts an integer JPY amount built by our code (`3292`, not `3292.00`).
- The server-side verification path works on a non-EUR, zero-decimal currency.
- The `POST /capture` response alone is not enough: it omits the purchase-unit
  amount, `custom_id` and payee, so a verifying `GET` is required. This is why
  `lib/paypal/payments.ts` re-reads the order after capturing.

## What this does not prove

Both runs created the order directly through the merchant API. The in-app path
from bill to charge to order to capture has **not** been exercised in JPY, because
the demo database holds no payable JPY charge. Do not describe the in-app
multi-currency flow as verified.

## Screenshots

Sandbox pages only. They show no buyer email and no password:

- `01-sandbox-login.png`: empty sandbox login page.
- `02-checkout-review.png`: sandbox checkout, `¥ 3,292`, masked card `••••1745`.
- `03-confirm-payment.png`: same review with the confirm button active.
