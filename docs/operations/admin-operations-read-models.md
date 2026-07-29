# Admin Operations Read Models

Status: initial read-only operator surface

Vault exposes `GET /admin/operations/overview` for backend operators. The endpoint is intentionally read-only and must not be used as a money/order correction API.

## Authentication

Set `ADMIN_API_TOKEN_FILE` to an absolute path containing a high-entropy token. Send that token in the `X-Admin-Token` request header.

The token value must never be committed, printed in logs, or pasted into tickets/docs.

## Current Scope

The overview returns redacted problem queues:

- top-up payments in `manual_review`;
- orders in `manual_review` or `failed`;
- fulfillment commands in pending/problem states with last attempt status;
- payment webhook events that were not processed, duplicated, or ignored.

Provider request/response snapshots, payment webhook payload snapshots, Steam Trade URL tokens, API keys, and raw provider bodies are not returned.

## Non-Goals

- No direct balance overwrite.
- No direct order status overwrite.
- No provider retry/refund/settlement commands.
- No customer-facing frontend surface.

Recovery actions must be implemented later as reasoned commands with audit events, idempotency, and compensating journal entries where money changes.
