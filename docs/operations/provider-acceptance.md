# Provider Acceptance

Status: real-provider release gate

This runbook is separate from deterministic tests. Deterministic tests prove local state machines, idempotency, redaction, wallet settlement, and projections. Provider acceptance proves that Vault works against the real sandbox/test provider surfaces with durable database evidence.

## Preflight

Run:

```sh
npm --prefix backend run acceptance:readiness
```

Expected behavior:

- exit `0` only when every real-provider gate has the required public origins and secret files;
- exit `1` when at least one gate is blocked;
- print only variable names and gate names, never secret values or secret file contents.

The readiness command checks these gates:

| Gate | Purpose |
| --- | --- |
| `steam-openid-browser` | Browser can start and finish Steam OpenID through public HTTPS backend and frontend origins. |
| `arc-pay-hosted-checkout` | Backend can create a real Arc Pay sandbox Hosted Checkout session using SBP-only configuration. |
| `arc-pay-webhook` | Provider webhook can be delivered to the backend public HTTPS origin and verified with the webhook signing secret. |
| `sih-catalog` | Backend can call SIH catalog/minimum item endpoints with the sandbox key. |
| `sih-skin-test-order` | Operator has supplied a test Steam identity and trade token file for a SIH skin test order. |
| `sih-steam-refill` | Operator has explicitly approved a mutating SIH Steam refill acceptance payment. |

If a gate is blocked, do not reinterpret deterministic tests as release evidence for that gate.

## Required Environment

Keep all files outside the repository. Never echo their contents.

| Variable | Required for |
| --- | --- |
| `PUBLIC_BASE_URL` | Steam OpenID callback and Arc Pay webhook delivery; must be HTTPS. |
| `PUBLIC_FRONTEND_ORIGIN` | Steam OpenID browser return; must be HTTPS. |
| `ARC_PAY_PROVIDER_MODE=real` | Arc Pay Hosted Checkout acceptance. |
| `ARC_PAY_SECRET_KEY_FILE` | Arc Pay Hosted Checkout and status polling. |
| `ARC_PAY_PUBLIC_ORIGIN` | Arc Pay success/fail/cancel URLs; must be HTTPS. |
| `ARC_PAY_WEBHOOK_SIGNING_SECRET_FILE` | Arc Pay webhook signature verification. |
| `SIH_API_KEY_FILE` | SIH catalog and skin purchase acceptance. |
| `SIH_STEAM_REFILL_API_KEY_FILE` | SIH Steam refill acceptance and fulfillment. |
| `SIH_ACCEPTANCE_STEAM_ID64` | SIH skin test-order recipient Steam identity. |
| `SIH_ACCEPTANCE_TRADE_TOKEN_FILE` | SIH skin test-order trade token. |
| `SIH_STEAM_REFILL_ACCEPTANCE_LOGIN` | SIH Steam refill recipient login. |
| `SIH_STEAM_REFILL_ACCEPTANCE_AMOUNT_RUB` | SIH Steam refill acceptance amount in whole RUB. |
| `SIH_STEAM_REFILL_MUTATION_APPROVED=yes` | Explicit acknowledgement that Steam refill acceptance spends SIH sandbox/test balance. |

`STEAM_WEB_API_KEY_FILE` is not required for Steam OpenID challenge verification. Add it only when a backend provider/profile call needs the Steam Web API.

## SIH Catalog Acceptance

Run after `acceptance:readiness` reports `READY sih-catalog`:

```sh
npm --prefix backend run acceptance:sih-catalog
```

Optional game list:

```sh
SIH_ACCEPT_GAMES=cs2,rust,tf2 npm --prefix backend run acceptance:sih-catalog
```

Accepted evidence may include:

- `SIH_SANDBOX_CATALOG_ACCEPTED`;
- game id;
- item count;
- hashed item identity from the test log.

Do not paste SIH API keys, raw item payloads with sensitive fields, or test-user trade tokens into docs, commits, screenshots, or chat.

## Arc Pay Acceptance

Arc Pay release evidence needs both provider/browser evidence and database proof.

Minimum sequence:

1. Start PostgreSQL/Redis and backend with `ARC_PAY_PROVIDER_MODE=real`.
2. Expose backend and frontend through public HTTPS origins.
3. Run `acceptance:readiness` and confirm `READY arc-pay-hosted-checkout` plus `READY arc-pay-webhook`.
4. Log in through the real browser session.
5. Create a Coins top-up from the UI; the request must create a durable top-up intent and Arc Pay provider attempt.
6. Complete the sandbox SBP Hosted Checkout flow through Arc Pay.
7. Deliver the signed webhook to the backend public HTTPS origin.
8. Confirm Coins are credited only from webhook/status reconciliation, not from browser return.
9. Record database evidence: top-up id, payment id, attempt status, webhook inbox state, wallet transaction id, and resulting Coins balance.

Evidence must be redacted. Never include Arc Pay secret keys, webhook signing secret, raw authorization headers, cookies, or full PII.

## Steam OpenID Acceptance

Steam OpenID acceptance is browser-only evidence, not a unit test.

Minimum sequence:

1. Expose backend and frontend through public HTTPS origins.
2. Run `acceptance:readiness` and confirm `READY steam-openid-browser`.
3. Start login from the frontend.
4. Complete Steam authentication in the browser.
5. Confirm backend sets the session cookie and `/auth/me` returns the authenticated Steam identity.
6. Confirm account UI hydrates from the backend session rather than local fallback state.

Accepted evidence may include request ids, SteamID64, user id, session creation timestamp, and sanitized screenshots.

## SIH Skin Test-Order Acceptance

Use SIH skin `create-order` with the provider test flag where supported by the current adapter. The goal is to prove request shape, provider acknowledgement, durable attempt state, and reconciliation behavior without spending real user funds.

Minimum sequence:

1. Run `acceptance:readiness` and confirm `READY sih-skin-test-order`.
2. Create or select a test user with Steam identity and configured Steam Trade URL.
3. Fund that user with test Coins through a verified top-up or controlled test fixture.
4. Add a currently available SIH-backed skin to the backend cart.
5. Checkout from Coins.
6. Submit fulfillment; verify a durable SIH `create_order` attempt exists before provider submission.
7. Reconcile SIH `get-order` until the local order line is terminal or explicitly manual review.
8. Record database evidence for order line, wallet hold, fulfillment command, provider attempt, and sanitized provider status.

Do not claim real Steam trade delivery unless SIH and Steam evidence proves delivery.

## SIH Steam Refill Acceptance

This is mutating provider work. Run it only with explicit operator approval and a small test amount.

Minimum sequence:

1. Set `SIH_STEAM_REFILL_MUTATION_APPROVED=yes`.
2. Run `acceptance:readiness` and confirm `READY sih-steam-refill`.
3. Create or select a test user and fund Coins.
4. Checkout a Steam refill line for `SIH_STEAM_REFILL_ACCEPTANCE_LOGIN` and the approved amount.
5. Submit fulfillment; verify a durable SIH `steam_check` attempt exists before provider check.
6. Verify `transactionId` is stored.
7. Submit SIH `steam_pay`; retry must reuse the stored `transactionId` if the first pay attempt is retryable.
8. Confirm order line terminal state and wallet hold settlement.
9. Record database evidence and provider nonsecret identifiers.

Do not run this gate against a personal or customer account.

## Evidence Rules

Every completed provider gate should leave a short dated evidence note under `docs/operations/evidence/` when release acceptance is being recorded. Use sanitized values only:

- command run and exit status;
- provider environment, for example sandbox;
- request ids, top-up ids, order ids, provider ids, and hashed item identities;
- database rows or selected columns that prove durable state;
- browser route/screenshot references when relevant;
- explicit skipped/blocked reason for gates that are not release-ready.

Never record:

- API keys, webhook secrets, cookies, session tokens, trade tokens, raw authorization headers;
- full Steam Trade URLs;
- raw provider payloads containing credentials or PII;
- screenshots that reveal secrets.
