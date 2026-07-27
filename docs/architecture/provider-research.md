# Provider Research

Status: initial source-backed research

Date: 2026-07-27

## Sources

- Arc Pay docs: `https://finext.gitbook.io/arc-pay/ru`, `https://finext.gitbook.io/arc-pay/ru/integracionnye-gaidy/hpp.md`, `https://finext.gitbook.io/arc-pay/ru/api-reference/overview.md`, `https://finext.gitbook.io/arc-pay/ru/vebkhuki/overview.md`
- BreenX quick information and LLM docs index, researched but not selected for first-release payment/refill: `https://breenx.readme.io/reference/краткая-информация-1`, `https://breenx.readme.io/llms.txt`
- BreenX transaction docs, researched only: `/transaction/start`, `/transaction/status`, callbacks, statuses, request signature, response signature, STEAM, STEAM_SBP, STEAM_DIRECT.
- SIH docs: `https://docs.sih.app/guide/`, `https://docs.sih.app/guide/purchases`, `https://docs.sih.app/steam-refill-api/`
- Locker local docs under `../Locker/docs/architecture/` and `../Locker/docs/development/`.
- Agent guidance sources: OpenAI AGENTS.md docs, agents.md, and arXiv papers on AGENTS.md efficiency/smells.

## Arc Pay findings

Arc Pay is the selected first-release provider for customer Coins top-up, following the existing Locker payment approach.

Integration shape:

- Use Hosted checkout sessions for redirect integration.
- Vault backend creates a checkout session; Arc Pay hosts the buyer-facing checkout page.
- Browser return to success/fail/cancel URL is not authoritative.
- Vault credits Coins only after a signed Arc Pay webhook or equivalent confirmed status/reconciliation read.
- Secret API keys are backend-only. Publishable/browser-safe keys are not needed for the first Hosted Checkout path.

Relevant API facts:

- Public API base is `https://api.arcpay.space/v1`.
- OpenAPI is published at `https://api.arcpay.space/openapi.json` and `https://api.arcpay.space/openapi.yaml`.
- Create Hosted Checkout: `POST /v1/checkout/sessions`.
- Authentication uses `Authorization: Bearer <secret-api-key>`.
- Mutating server-side operations require `Idempotency-Key`; duplicate same-key/same-payload requests are retained for 72 hours, and same-key/different-payload requests conflict.
- Checkout session request uses integer `amount` in minor units and `currency` such as `RUB`, `KZT`, or `UZS`.
- Use `capture_mode: "one_stage"` for immediate capture.
- `success_url`, `fail_url`, and `cancel_url` must be HTTPS URLs.
- `payment_methods` must use method/mode pairs returned by `GET /payment-methods/available` for the same API key environment and shop configuration.
- Environment is selected by API key prefix; do not send a separate environment field to create checkout.
- Standard methods include `bank_card` and `sbp`, but actual availability must come from discovery for the active merchant/shop/environment.
- Checkout sessions do not have a per-request `callback_url`; payment webhooks for checkout sessions use the merchant-level webhook endpoint configured in the Arc Pay portal.

Webhook facts:

- Arc Pay sends signed POST webhooks for payment outcomes.
- Do not rely on synchronous API response or browser redirect for terminal payment state.
- A 2xx response within 10 seconds confirms delivery; other responses trigger retries.
- Retries use exponential backoff up to 72 hours.
- Webhook verification must happen before business processing.
- Webhook delivery deduplicates by `Webhook-Id`; endpoint/tenant secrets are separate from API keys.

Architecture implication:

- `payments` owns Arc Pay checkout creation, callback inbox, reconciliation, refunds/chargebacks, and wallet top-up posting.
- Top-up amount is RUB kopecks at Arc Pay and Coins minor units in Vault's wallet journal.
- The frontend shows active rate, Coins credited, and final RUB amount before redirecting to Arc Pay.
- Browser return may show pending/success UI copy, but must not post Coins by itself.

## BreenX findings, not selected

BreenX exposes API v1 at `https://app.breenx.net/gate/api/v1`. It was researched because it was initially supplied as a possible service, but it is not the selected first-release provider after the Arc Pay decision.

Authentication/signing:

- Requests may use `X-Project-Secret`.
- Alternatively requests use `X-Project-ID` plus `X-Sign`.
- `X-Sign` is a base64 RSA SHA-256 signature of the exact JSON request body using the merchant private key.
- BreenX signs response/callback bodies with a response signature header documented as `X-Sing`/`X-Sign`; implement the adapter defensively, but lock the exact header after credentialed sandbox evidence.
- Secrets and key files are backend-only.

Relevant endpoints:

- `POST /transaction/check`: checks whether a transaction can be paid and performs conversion to RUB.
- `POST /transaction/rate`: converts currencies.
- `POST /transaction/start`: creates a transaction.
- `POST /transaction/status`: returns transaction status.
- `POST /transaction/refund`: refunds a transaction.

Transaction start request:

- Required: `order_id`, `currency`, `amount`, `pay_method`, `descr`.
- Optional: `callback_url`, `success_url`, `fail_url`, `extra`, `merchant_param`.
- For `steam`, `steam_sbp`, and `steam_direct`, `extra.account` is required.
- Documented currencies in the OpenAPI fragment include `RUB` and `USD`.
- Response includes a provider transaction id and may include `pay_form_url` for hosted payment/refill flows.

Statuses:

- OpenAPI enum: `new`, `process`, `paid`, `expired`, `refunded`, `declined`.
- Status page text: `NEW`, `PROCESS`, `PAID`, `FAILED`, `EXPIRED`.
- Treat status mapping as an explicit adapter concern and record unknown/unmapped statuses as incidents, not guessed success/failure.

Callbacks:

- BreenX sends a POST to `callback_url` when status changes.
- Callback JSON body uses the same shape as `/transaction/status`.
- Callback URL must be HTTPS and return 200.
- Every callback signature must be verified before business processing.

Steam methods:

- `steam`: card payment for Steam account refill; provider returns a hosted card form URL.
- `steam_sbp`: SBP payment for Steam account refill; docs recommend `check` first with Steam account and USD amount, then `start`; form displays RUB.
- `steam_direct`: refill funded from project balance; `start` reserves project funds and reports status through callback/status.

Architecture implication:

- If Vault uses BreenX for customer-paid Steam refill, the backend creates a BreenX transaction and browser navigates to `pay_form_url`.
- If Vault uses BreenX only as a Steam refill provider after internal wallet debit, use `steam_direct` and treat BreenX result as fulfillment, not as customer payment.
- Do not mix these flows without a product decision. Customer-paid refill and wallet-paid refill have different ledger effects.
- Current Vault decision: do not use BreenX for first-release Steam refill fulfillment or Coins top-up. Use SIH for Steam refill fulfillment and Arc Pay for Coins top-up.

## SIH findings

Market API authentication:

- Requests include the project's API key in the `apikey` header.
- API key must never be exposed client-side.

Skin purchase API:

- `POST https://api.sih.market/api/v1/create-order`
- Body includes `steamId`, `token`, `amount`, `item`, `customId`, `test`, `appId`.
- `test: true` simulates a purchase without debiting SIH balance.
- `customId` provides the merchant idempotency/correlation key.
- `409 custom id already exists` returns the existing order projection.

Order lookup:

- `GET /api/v1/get-order` by provider `id` or merchant `customId`.
- `GET /api/v1/get-order-history` supports limit/offset.
- `POST /api/v1/get-orders` batch-looks up ids/customIds.

Order statuses:

- `created`: purchase created and awaiting item search.
- `processing`: item found, waiting for seller to send trade offer.
- `sent`: seller sent offer.
- `finished`: buyer accepted offer.
- `failed`: purchase failed.
- `penalized`: purchase failed with penalty.
- Docs note `sent` can move back to `processing`; local state must not assume monotonic provider status.

Protection statuses:

- `processing`: waiting for trade protection window.
- `finished`: protection completed successfully.
- `failed`: buyer or seller activated protection.
- Errors include `rollback user` and `rollback supplier`.

Steam refill API:

- Base URL: `https://core.steaminventoryhelper.com`.
- Authentication header: `api-key`.
- Flow is two-step:
  - `POST /p/api/v1.0/steam/check` validates `steamUsername` and returns `transactionId`.
  - `POST /p/api/v1.0/steam/pay` charges SIH balance and performs the refill.
- `transactionId` is bound to the API key owner and expires after 1 hour.
- Rate limit: each endpoint is independently limited to 1 request per 10 seconds per authenticated user.
- `pay` fields: `steamUsername`, `amount`, `currency`, `transactionId`; currency must be `RUB`.
- Amount limits: 50 RUB minimum and 9433 RUB maximum.
- Successful `transactionId` is marked used for 24 hours and repeat submission should return the existing successful payment rather than charging again.

Architecture implication:

- SIH skin purchase is a supplier fulfillment flow after Vault wallet hold/debit logic, not a direct customer payment flow.
- SIH Steam Refill is the first-release Steam refill fulfillment path because Vault sells refill orders for internal Coins first, then fulfills them from project/provider balance.

## Resolved decisions

- Steam refill in the first release is paid from the internal Coins wallet.
- SIH Steam Refill API is the preferred fulfillment provider for Steam refill.
- BreenX Steam methods are not part of the first-release refill path unless SIH acceptance fails or the owner explicitly changes the decision.
- Coins top-up in the first release uses Arc Pay Hosted Checkout, same as Locker.

## Open product/architecture questions

These require product/owner decision before provider implementation:

1. What is the final fixed coin rate?
2. What are final languages, currencies, company legal details, domain, support email, and public Arc Pay return/webhook origins?
3. Is "sell inventory to site" required in first release? If yes, what provider-backed valuation and settlement path authorizes it?

## Agent-workflow research takeaways

- Root `AGENTS.md` should behave like a README for agents: predictable setup, tests, conventions, and routing.
- Codex discovers instruction files from global scope through project/nested directories; closer files override broader guidance.
- Research on AGENTS.md found efficiency gains in one study, but another study found common smells: lint leakage, context bloat, skill leakage, and conflicting instructions.
- Vault therefore keeps `AGENTS.md` short and routes durable detail to focused docs. Agents should read the smallest owning docs for their task rather than loading every historical note.
- Parallel agents need explicit path ownership, frozen interfaces, coordinator review, and serialized shared files.
