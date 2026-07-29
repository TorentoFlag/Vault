# Admin Operations

Status: read models plus first reasoned recovery command

Vault exposes token-gated backend operator endpoints. They are intentionally narrow and must not be used as direct money/order correction APIs.

## Authentication

Set `ADMIN_API_TOKEN_FILE` to an absolute path containing a high-entropy token. Send that token in the `X-Admin-Token` request header.

The token value must never be committed, printed in logs, or pasted into tickets/docs.

## Read Model Scope

`GET /admin/operations/overview` returns redacted problem queues:

- top-up payments in `manual_review`;
- orders in `manual_review` or `failed`;
- fulfillment commands in pending/problem states with last attempt status;
- payment webhook events that were not processed, duplicated, or ignored.

Provider request/response snapshots, payment webhook payload snapshots, Steam Trade URL tokens, API keys, and raw provider bodies are not returned.

## Recovery Command Scope

`POST /admin/operations/payments/reconcile` runs Arc Pay pending top-up reconciliation through the existing `PaymentsService`.

Required headers:

- `X-Admin-Token`: token from `ADMIN_API_TOKEN_FILE`;
- `Idempotency-Key`: unique admin operation key.

Body:

```json
{
  "reason": "recover missing Arc Pay webhook",
  "limit": 20
}
```

Rules:

- `reason` is required and must explain the operator action.
- `limit` must be between 1 and 100. The default is 20.
- The command only reconciles `checkout_pending` Arc Pay top-ups.
- The command does not directly overwrite balances, orders, provider statuses, or ledger rows.
- Arc Pay provider lookup runs outside an open database transaction.
- The existing payment service writes provider attempt evidence and applies wallet credits idempotently through wallet ledger logic.
- A completed admin operation records `idempotency_keys(scope='admin:payments:reconcile')` and an `audit_events(action='admin.payments.reconcile')` row.
- Reusing the same `Idempotency-Key` with the same body returns `status: "duplicate"` and does not rerun provider reconciliation.
- Reusing the same `Idempotency-Key` with a different body returns conflict.

## Non-Goals

- No direct balance overwrite.
- No direct order status overwrite.
- No provider retry/refund/settlement commands beyond Arc Pay status polling reconciliation for missing webhooks.
- No customer-facing frontend surface.

Future recovery actions must follow the same shape: reasoned command, durable idempotency, durable audit, no secrets in outputs, and compensating journal entries where money changes.
