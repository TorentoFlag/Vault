# Vault Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for parallel task execution only after the coordinator writes `.agents/coordination.md`. Use superpowers:executing-plans for inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the imported Vault frontend into a production backend-owned storefront where users buy Coins through Arc Pay, then spend Coins on SIH-backed Steam skin purchases and SIH-backed Steam account refill, with GPT refill deferred.

**Architecture:** Build a NestJS/PostgreSQL modular-monolith backend, generate OpenAPI contracts for the existing Next.js frontend, and migrate frontend localStorage commerce flows slice by slice. Arc Pay handles Coins top-up through Hosted Checkout; SIH handles skin and Steam refill fulfillment. Provider effects use durable attempts, idempotency, inbox/outbox, workers, reconciliation, and real sandbox evidence.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, NestJS, PostgreSQL, Drizzle ORM, Redis, BullMQ, OpenAPI, Node test runner or Vitest as selected during backend foundation.

## Global Constraints

- Preserve the existing frontend visual direction unless a change is required by real product behavior.
- First release includes skins and Steam refill only.
- GPT refill remains hidden or explicitly unavailable until API details are supplied.
- Customer-facing balances and product prices are denominated in Coins.
- No customer-facing dollar symbol.
- Use integer/scaled money and rate calculations only.
- Arc Pay and SIH secrets are backend-only.
- No external side effect without durable attempt, idempotency, timeout, redaction, and recovery path.
- Real provider acceptance is separate from deterministic test evidence.

---

### Phase 0: Repository and Documentation Foundation

**Files:**
- Created: `AGENTS.md`
- Created: `docs/README.md`
- Created: `docs/architecture/project-architecture.md`
- Created: `docs/architecture/provider-research.md`
- Created: `docs/development/agent-workflow.md`
- Created: `docs/development/commands.md`
- Created: `docs/superpowers/plans/2026-07-27-vault-implementation-roadmap.md`
- Removed: `frontend/.git`

**Acceptance:**
- [ ] Root contains agent routing and project docs.
- [ ] `frontend/.git` is absent.
- [ ] Current frontend tests pass.
- [ ] Missing/blocked checks are reported.

### Phase 1: Product Decisions That Block Backend Contracts

**Owner:** main coordinator and product owner.

**Decisions required before backend provider implementation:**
- [x] Use SIH Steam Refill as the first-release Steam refill fulfillment path.
- [x] Require Steam refill checkout to be paid from pre-funded internal Coins, not direct card/SBP payment.
- [x] Use Arc Pay Hosted Checkout as the first-release Coins top-up/payment provider, same as Locker.
- [ ] Set final fixed coin rate.
- [ ] Provide legal entity, INN, legal address, domain, support email, and work hours.
- [ ] Provide final languages/currencies.
- [ ] Provide public callback/success/fail origins or confirm local/staging origins for sandbox.
- [ ] Decide whether sell-to-site inventory action is in first release; if yes, provide provider-backed valuation/settlement rules.

**Acceptance:**
- [ ] Decisions are recorded in `docs/architecture/project-architecture.md`.
- [ ] Frontend copy is aligned with implemented scope and does not promise unavailable flows.

### Phase 2: Backend Foundation

**Files:**
- Create: `backend/package.json`
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/config/*`
- Create: `backend/src/common/problem-details/*`
- Create: `backend/src/common/idempotency/*`
- Create: `backend/src/common/http/*`
- Create: `backend/src/modules/health/*`
- Create: `backend/drizzle/*`
- Create: `compose.dev.yaml`
- Modify: `docs/development/commands.md`

**Tasks:**
- [x] Scaffold NestJS backend with strict TypeScript, lint, typecheck, test, build, and verify commands.
- [x] Add configuration loader with explicit required envs and secret-file support.
- [x] Add Problem Details error envelope and request-id middleware.
- [x] Add PostgreSQL/Drizzle and Redis/BullMQ wiring.
- [x] Add liveness/readiness/capabilities endpoints.
- [x] Add OpenAPI generation/check scripts.
- [x] Add integration test containers for PostgreSQL and Redis.

**Acceptance:**
- [x] `npm --prefix backend run verify` passes.
- [x] `docker compose -f compose.dev.yaml up -d --wait postgres redis` works.
- [x] OpenAPI is generated and checked.

### Phase 3: Identity and Sessions

**Files:**
- Create: `backend/src/modules/auth/*`
- Create: `backend/src/modules/users/*`
- Create: `backend/src/modules/sessions/*`
- Create: `backend/src/modules/audit/*`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/generated/api-contract.json`
- Later modify: `frontend/src/lib/auth.ts`
- Later modify: `frontend/src/components/marketplace/MarketplaceProvider.tsx` or replace it with API-backed providers.

**Tasks:**
- [x] Implement Steam OpenID challenge/callback, nonce/state validation, SteamID64 extraction, and session creation.
- [ ] Implement optional email auth only if product confirms it remains.
- [x] Store sessions in HTTP-only secure cookies; do not use localStorage for session identifiers.
- [x] Add CSRF protection for cookie-authenticated state-changing requests.
- [x] Add encrypted write-only Steam Trade URL storage.
- [x] Persist Steam auth attempts, users, sessions, and Trade URL credential envelopes in PostgreSQL with integration coverage.
- [x] Generate frontend contract snapshot and implement shared API transport.
- [ ] Migrate account header/profile/Steam settings from local mock session to backend session. Current status: the auth screen starts backend Steam OpenID; `MarketplaceProvider` hydrates backend session/cart/wallet, purchase history, inventory projection, Steam trade/fulfillment history, posted Coins operation history, and Steam Trade URL configured status when the cookie exists; Steam Trade URL saves through `/me/steam-trade-url` for backend sessions without exposing the saved token back into the form; Email auth still uses local concept state.

**Acceptance:**
- [x] Backend auth/session tests pass.
- [x] Frontend API/auth transport tests pass against deterministic API fixtures.
- [ ] Real Steam OpenID acceptance is recorded separately before release.

### Phase 4: Catalog and Pricing

**Files:**
- Create: `backend/src/modules/catalog/*`
- Create: `backend/src/modules/pricing/*`
- Create: `backend/src/modules/providers/sih/*`
- Modify: `frontend/src/features/catalog/*`
- Modify: `frontend/src/features/product/*`
- Modify: `frontend/src/features/home/*`

**Tasks:**
- [x] Define normalized first-release product identity with provider-independent game/category fields.
- [x] Implement SIH catalog/item adapter with bounded response size, timeouts, API-key file, and redaction.
- [x] Store live supplier listings and freshness in PostgreSQL.
- [x] Implement integer price conversion into Coins with append-only pricing settings.
- [x] Implement public catalog/search/facet endpoints and product detail endpoint.
- [x] Hide/defer GPT products in first release backend catalog.
- [x] Migrate home/catalog/product pages to backend data while preserving visual layout.

**Acceptance:**
- [x] Search returns exact keyword results for terms such as `Пистолет` and `Автомат` in backend catalog API.
- [x] No small-category count badges are introduced in backend facets.
- [x] Backend catalog prices are in Coins minor units only.
- [ ] Real SIH catalog/point acceptance is recorded before release.

### Phase 5: Wallet, Payments, and Top-Up

**Files:**
- Create: `backend/src/modules/wallet/*`
- Create: `backend/src/modules/payments/*`
- Create: `backend/src/modules/providers/arc-pay/*`
- Modify: `frontend/src/features/top-up/*`
- Modify: `frontend/src/features/account/*`

**Tasks:**
- [x] Implement double-entry Coins wallet journal, active holds, active-hold settlement, available balance projection, and current-user posted transaction history.
- [ ] Implement wallet reconciliation.
- [x] Implement top-up/payment aggregate with immutable displayed terms. Current status: `/payments/top-up/sessions` creates idempotent Arc Pay top-up intents and provider attempts; disabled mode returns `provider_configuration_required`, while deterministic fake mode returns `checkout_pending` plus a fake checkout URL.
- [ ] Implement Arc Pay checkout-session creation, method discovery, real webhook verification, status/reconciliation, refund and chargeback adapters. Current status: real Hosted Checkout creation exists for sandbox keys and sends SBP-only `payment_methods`; real webhook signature verification exists for `Webhook-Id`, `Webhook-Timestamp`, and `Webhook-Signature`; method discovery, status/reconciliation, refunds, and chargebacks remain.
- [ ] Implement webhook inbox, status polling, idempotent posting, and reconciliation. Current status: signed webhook inbox and idempotent wallet posting exist for fake and real Arc Pay signature formats; real Hosted Checkout webhooks are correlated by signed `data.payment_id` plus `GET /payments/{id}` lookup to recover `external_id`/`metadata.vault_top_up_id`; status polling and full reconciliation remain.
- [ ] Implement top-up UI with active rate, Coins credited, fiat amount, accepted legal checkbox, and disabled payment until consent. Current status: UI shows active rate/fiat amount, requires legal consent, creates backend top-up sessions, redirects when backend returns a checkout URL, and shows provider-configuration state when no checkout URL exists.
- [x] Ensure browser return never credits wallet by itself.

**Acceptance:**
- [x] Wallet tests prove balanced immutable journal and idempotency for top-up credit and order hold settlement. Broader reconciliation remains open.
- [ ] Arc Pay adapter contract tests cover idempotency, method discovery, checkout creation, webhook verification, status mapping, unknown events, refunds/chargebacks, and retries.
- [ ] Real Arc Pay sandbox/test transaction evidence is recorded before enabling Coins top-up. Current status: Vault has sandbox Hookdeck endpoints for local Hosted Checkout return URLs and webhook delivery; signed Hookdeck delivery into local backend was accepted and posted Coins in test DB. A real paid Arc Pay sandbox transaction still needs provider-side payment completion evidence before release.

### Phase 6: Cart and Checkout

**Files:**
- Create: `backend/src/modules/cart/*`
- Create: `backend/src/modules/checkout/*`
- Create: `backend/src/modules/orders/*`
- Modify: `frontend/src/features/cart/*`
- Modify: `frontend/src/features/checkout/*`

**Tasks:**
- [x] Implement authenticated server-side cart.
- [x] Implement server cart quote refresh from current backend catalog prices.
- [ ] Implement explicit customer confirmation for price increases.
- [x] Implement checkout from Coins wallet only.
- [x] Expand each quantity unit into an independent order line.
- [x] Snapshot nonsecret Steam Trade recipient and Steam refill recipient data immutably at checkout.
- [x] Create wallet holds atomically with orders.
- [x] Create fulfillment outbox commands atomically after fulfillment module exists. Current status: checkout creates one pending SIH fulfillment command per persisted order line in the same database transaction as order creation and wallet hold creation; worker execution and provider reconciliation remain Phase 7.
- [ ] Migrate frontend cart/checkout from localStorage purchase records to backend API. Current status: backend-cookie sessions use `/wallet/me`, `/cart`, `/checkout/cart`, `/orders/me`, and backend-owned Steam Trade URL readiness; unauthenticated/demo frontend auth still falls back to local concept state until Phase 3 account/session migration is complete.

**Acceptance:**
- [ ] User cannot reach final checkout without sufficient balance or provider-approved direct-payment route.
- [ ] Legal consent checkbox blocks payment/purchase button.
- [x] Purchase history shows prior purchases from backend for backend-cookie sessions.

### Phase 7: Fulfillment

**Files:**
- Create: `backend/src/modules/fulfillment/*`
- Create: `backend/src/modules/inventory/*`
- Create: `backend/src/modules/providers/sih/*`
- Modify: `frontend/src/features/account/*`

**Tasks:**
- [ ] Implement SIH create-order/get-order/get-orders flow with `customId` idempotency. Current status: `create-order` and `get-order` client methods are implemented with deterministic contract coverage; batch `get-orders` remains.
- [x] Persist supplier attempt before provider call. Current status: checkout persists provider-agnostic fulfillment commands first; skin submission creates `create_order`/`get_order` attempts before SIH calls, and Steam refill creates `steam_check`/`steam_pay` attempts before SIH calls.
- [x] Treat 200 create as acknowledgement, not delivery. Current status: skin `create-order` 200 marks the attempt/command as submitted and leaves delivery/reconciliation to later status processing.
- [x] Reconcile statuses `created`, `processing`, `sent`, `finished`, `failed`, `penalized`. Current status: deterministic reconciliation creates durable `get-order` attempts, persists provider snapshots, prevents `sent -> processing` customer-facing regression, closes `finished` commands as completed, closes `failed`/`penalized` commands as failed, and settles the order wallet hold once every order line is terminal.
- [x] Handle protection `processing`, `finished`, `failed`, `rollback user`, `rollback supplier`. Current status: `protection.processing` keeps the skin command submitted and the Coins hold active; `protection.finished` allows normal capture; `protection.failed` moves the command/order to manual review with rollback evidence and no automatic wallet settlement.
- [x] Keep provider status regressions from corrupting local monotonic customer-facing state. Current status: `sent -> processing` does not regress an already `supplier_sent` order line, and `supplier_finished` does not regress to a non-terminal state.
- [x] Implement inventory projection and only enable actions backed by real transitions. Current status: `/inventory/me` returns only the current user's fulfilled skin order lines; frontend backend-cookie sessions load that projection into the account inventory; sell-to-site and withdraw-to-Steam actions are visible but disabled with explicit copy until backend-owned transitions exist.
- [x] Implement customer-visible Steam trade/fulfillment history projection. Current status: `/fulfillment/me/trades` returns only the current user's skin fulfillment events, excludes provider snapshots/secrets, maps monotonic fulfillment states to customer statuses, and frontend backend-cookie sessions load it into the account Steam Trade log.
- [x] Implement Steam refill fulfillment through SIH Steam Refill API. Current status: deterministic worker calls `steam/check`, persists SIH `transactionId`, calls `steam/pay`, retries pay with the existing `transactionId` after retryable pay failure, and settles the Coins hold on success.

**Acceptance:**
- [ ] Deterministic tests cover retries, duplicate `customId`, unknown lookup, sent-to-processing regression, rollback, partial fulfillment, and Redis-loss recovery. Current status: durable attempts, duplicate `customId`, `sent -> processing`, terminal success capture, terminal failure release, SIH protection wait/manual-review rollback handling, Steam refill happy path, and Steam refill pay retry with existing `transactionId` are covered.
- [ ] Real SIH test-order acceptance is recorded before enabling skin purchase.
- [ ] Real Steam refill provider acceptance is recorded before enabling Steam refill.

### Phase 8: Legal, Support, Admin, Operations

**Files:**
- Create: `backend/src/modules/legal/*`
- Create: `backend/src/modules/support/*`
- Create: `backend/src/modules/admin/*`
- Create: `docs/operations/*`
- Modify: `frontend/src/components/layout/SiteFooter.tsx`
- Modify: `frontend/src/features/legal/*`
- Modify: `frontend/src/features/support/*`

**Tasks:**
- [ ] Move legal/company details into one backend or shared config source.
- [ ] Replace placeholder company/INN/address/support values.
- [ ] Ensure footer/document details match exactly.
- [ ] Implement support ticket or mail handoff with clear operational behavior.
- [ ] Implement minimal admin read models and reasoned recovery commands.
- [ ] Add backup/restore, deployment, rollback, incident, reconciliation, and secret-rotation runbooks.

**Acceptance:**
- [ ] Footer contains payment logos, legal identity, support email, work hours, Valve disclaimer, and legal links.
- [ ] Legal tests verify no inconsistent company/support details.
- [ ] Admin commands cannot directly overwrite money/order state.

### Phase 9: Browser QA and Release Gates

**Files:**
- Create: `frontend/e2e/*`
- Create: `frontend/playwright.config.ts`
- Modify: `frontend/package.json`
- Modify: `docs/development/commands.md`

**Tasks:**
- [ ] Add production-build Playwright gate with deterministic API fixtures.
- [ ] Cover desktop/mobile home, catalog, product, auth, Steam settings, cart, checkout, top-up, account history, inventory, support, and legal routes.
- [ ] Add accessibility checks for focus, keyboard, tap targets, landmarks, and contrast where practical.
- [ ] Add provider acceptance runbooks that are explicitly separate from fixture E2E.
- [ ] Run final full backend/frontend verification and record skipped external gates.

**Acceptance:**
- [ ] Unit/type/lint/build gates pass.
- [ ] Browser E2E passes on desktop and mobile.
- [ ] Real provider gates required for release are recorded or explicitly blocked.
- [ ] No customer-facing mock/local-only copy remains on real flows.

## Self-review

- First-release scope is skins plus SIH-backed Steam refill; GPT is deferred.
- Arc Pay is selected for Coins top-up; SIH is selected for skin and Steam refill fulfillment.
- Current frontend visual value is preserved while replacing localStorage authority.
- Money, provider, and fulfillment invariants are copied into tasks rather than left as vague guidance.
- Agent autonomy is supported through docs, ownership rules, and acceptance gates without overloading root `AGENTS.md`.
