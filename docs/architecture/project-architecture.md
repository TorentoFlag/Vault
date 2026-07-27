# Vault Project Architecture

Status: initial implementation direction

Date: 2026-07-27

## Decision summary

Vault should be built as a backend-first digital-goods storefront. The imported frontend is a strong visual prototype and current UX inventory, but production correctness must come from a new backend contract.

Recommended foundation:

- one repository with top-level `backend/` and `frontend/`;
- NestJS modular monolith for backend;
- PostgreSQL with Drizzle ORM as durable source of truth;
- Redis and BullMQ for recoverable background/critical work;
- one backend image with API, critical worker, and background worker entrypoints;
- backend-generated OpenAPI as the frontend contract;
- SIH for Steam-traded skin catalog/purchase/fulfillment and Steam account refill fulfillment;
- Arc Pay Hosted Checkout for customer Coins top-up, matching the Locker payment approach;
- Steam OpenID for skin-purchase identity;
- internal wallet in Coins with append-only financial history.

This deliberately mirrors the proven Locker shape where it fits: one backend, explicit module boundaries, durable provider attempts, idempotency, reconciliation, and browser/provider acceptance separated from deterministic UI tests.

## First-release scope

Included:

- public catalog for skins and Steam refill products, both paid from the internal Coins wallet;
- search and filters for available product categories;
- internal Coins wallet;
- top-up/payment flow sufficient to fund purchases or pay/refill through the approved provider flow;
- Steam identity for skin checkout;
- Steam Trade URL collection and immutable snapshot at checkout;
- cart, checkout, order history, payment history, trade/fulfillment history;
- inventory page for purchased/won items with actions only when backed by real state transitions;
- legal pages, footer, 18+ warning, Valve disclaimer, support contact, payment logos.

Excluded from first release:

- GPT refill;
- user-to-user marketplace;
- seller payouts;
- inventory sale to site unless a provider-backed sale/valuation path is implemented;
- admin direct balance overwrite;
- frontend-only money/order state;
- mock provider success as release evidence.

## Product and legal rules

- Use sans-serif fonts only. The current frontend uses Inter and Rajdhani and may keep that visual language.
- No Lorem Ipsum, dead buttons, or empty links.
- No `$` symbol in customer UI.
- Catalog prices and wallet balances are always in Coins.
- Fixed coin rate must not be 1:1 to fiat. Current concept uses `1 RUB = 1.5 Coins`; Locker used `1 RUB = 1.7` internal units. Pick one before backend Task 2 and keep it central.
- Place 18+ warning in a persistent header/footer/banner surface.
- Footer must include payment logos, legal identity, support email on the site domain, work hours, Valve disclaimer, and links to privacy, offer/user agreement, refund terms, and Provably Fair.
- Do not show product count badges for small categories.
- If sell-to-site is not working, remove "и продавайте" from all public copy and disable/hide sale actions with honest state-specific copy.

## Backend modules

- `auth`: customer sessions, Steam OpenID, email auth if retained.
- `users`: profile, account status, public identity.
- `catalog`: normalized products, categories, supplier listings, availability, search facets.
- `pricing`: provider prices, markup, coin conversion, quote snapshots.
- `wallet`: immutable Coins ledger, holds, available balance projection, reconciliation.
- `payments`: Arc Pay Hosted Checkout sessions for Coins top-up, webhook inbox, payment status reconciliation, refund/chargeback handling.
- `cart`: authenticated server-side cart and quote refresh.
- `checkout`: orchestration of quote validation, wallet holds, orders, and provider outbox.
- `orders`: order aggregate and per-line state.
- `fulfillment`: SIH skin purchase/trade/protection and SIH Steam refill provider actions.
- `inventory`: customer-owned item projection and allowed item actions.
- `legal`: versioned public documents and public company details.
- `support`: support tickets or mail handoff, depending on release target.
- `admin`: redacted read models and reasoned operations.
- `audit`: append-only sensitive/admin action events.
- `outbox`: durable publication and worker recovery.
- `health`: liveness, readiness, capabilities, degraded reasons.

## Dependency rules

- Each module owns its database tables and exposes application services or query ports.
- Controllers validate transport and authorization only; domain transitions live in services.
- Provider models stay inside adapters. Domain/frontend contracts use normalized provider-independent types.
- Cross-module effects write through caller-owned transactions and transactional outbox.
- Read models are allowed for UI speed but cannot become alternate sources of truth.
- No provider request happens inside an open database transaction.

## Money and state invariants

- Coins are stored as integer minor units, for example hundredths of one Coin.
- RUB provider amounts are integer kopecks.
- USD/provider prices are integer scaled units, for example micro-USD.
- FX, markup, commission, and conversion rates are scaled integers.
- Every posted wallet transaction balances to zero.
- Holds are separate from posted journal entries.
- Available balance equals posted customer balance minus active holds.
- Corrections, refunds, chargebacks, rollbacks, and admin adjustments are compensating entries, never edits to posted history.
- Every money-moving command has an idempotency key.
- Browser return after payment is informational; provider callback/status/reconciliation is authoritative.

## Frontend migration strategy

Preserve the imported frontend's visual system and route coverage, but replace local state in phases:

1. Freeze the current frontend with tests and screenshots.
2. Introduce shared API transport, generated types, Problem Details handling, CSRF/idempotency helpers.
3. Replace auth/session with backend-owned sessions.
4. Replace catalog/search/cart/checkout/wallet/order/inventory screens one slice at a time.
5. Remove GPT surfaces from first-release navigation or leave them as honest unavailable product placeholders.
6. Remove all "local/demo/external not connected" copy when the matching backend flow becomes real.

## Acceptance evidence

Deterministic tests can prove UI logic, state machines, parsing, idempotency, and recovery. They do not prove provider acceptance.

Release evidence for provider work requires:

- real provider test/sandbox request with sanitized input/output evidence;
- database proof of durable attempt/inbox/outbox/domain state;
- frontend/browser proof for the relevant user flow;
- reconciliation proof when money or fulfillment is involved;
- docs updated to match the observed behavior.
