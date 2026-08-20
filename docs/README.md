# Vault documentation

This is the entry point for humans and agents. Documentation describes current intended behavior; Git history will record the past after the root repository is initialized.

## Current project state

- Root Git repository: initialized on `main`.
- `frontend/.git`: removed; `frontend/` is now a normal project folder.
- Frontend: Next.js 16, React 19, TypeScript, CSS Modules, backend-fed public catalog pages, dynamic Steam refill form with RUB input and Coins quote, plus server-backed cart/checkout, Steam Trade URL saving, purchase history, inventory projection, Steam trade/fulfillment history, Coins operation history, and top-up session creation when a real backend cookie session is present.
- Current frontend coverage: backend-fed home/catalog/product surfaces, Coins, local cart, checkout gate, account, purchase history, inventory, Steam Trade URL form, support draft, legal routes, footer SBP payment logo, FAQ, and search.
- Current backend coverage: Steam session foundation, backend-fed catalog/pricing, dynamic Steam refill products generated from SIH RUB amount bounds, SIH supplier listing sync for `cs2`, `rust`, and `tf2`, catalog metadata snapshots for public titles/descriptions/images, authenticated server cart, initial Coins wallet ledger/holds, checkout order creation from wallet balance, atomic durable fulfillment command creation for each order line, deterministic SIH skin `create-order`/`get-order` adapter coverage, durable skin fulfillment attempt creation before SIH submission, current-user order history, current-user inventory projection for fulfilled skin order lines, backend-owned inventory withdrawal request creation, current-user Steam trade/fulfillment history projection for skin order lines and withdrawal requests, current-user posted Coins operation history, durable payment provider top-up intents with immutable Coins/RUB terms, real payment provider sandbox Hosted Checkout creation with SBP-only request payload, real payment provider webhook signature verification, deterministic webhook inbox/posting tests for idempotent Coins crediting, payment provider status polling reconciliation for missing webhooks, webhook-driven manual review for refunded or chargebacked paid top-ups without automatic wallet reversal, token-gated read-only admin operations overview for problem queues, token-gated audited admin payment provider reconciliation command with durable idempotency, token-gated audited admin SIH submitted skin reconciliation command with durable idempotency, deterministic commerce smoke covering Coins top-up, mixed checkout, SIH skin delivery, Steam refill delivery, and customer projections, plus an executable provider-acceptance readiness gate for external release evidence.
- Current frontend limitation: no real Steam OpenID browser acceptance and no real SIH purchase/refill. Steam login now starts the backend Steam OpenID flow; Email remains a local fallback until a production email-auth decision exists. For backend-cookie sessions, saved Steam Trade URL is kept backend-side and the frontend only shows configured/not configured status; purchase history is loaded from `/orders/me`; inventory is loaded from `/inventory/me`; sell-to-site remains disabled until a provider-backed valuation/settlement path is approved; withdraw-to-Steam creates a backend `/inventory/me/items/{itemId}/withdrawals` request when Steam Trade URL is configured; Steam trade/fulfillment history is loaded from `/fulfillment/me/trades`; Coins operation history is loaded from `/wallet/me/transactions`; top-up form creates `/payments/top-up/sessions` records and redirects only when the backend returns a checkout URL. Coins are credited only after verified webhook/reconciliation processing; current payment provider acceptance covers sandbox Hosted Checkout creation plus signed Hookdeck webhook delivery into local backend, not a real paid user transaction.
- First release scope: skin purchase and Steam account refill only.
- Deferred scope: GPT refill until provider API and product rules are supplied.

## Start here

| Need | Read |
| --- | --- |
| Durable architecture | [`architecture/project-architecture.md`](architecture/project-architecture.md) |
| Provider findings | [`architecture/provider-research.md`](architecture/provider-research.md) |
| Agent workflow | [`development/agent-workflow.md`](development/agent-workflow.md) |
| Command matrix | [`development/commands.md`](development/commands.md) |
| Admin operations read models | [`operations/admin-operations-read-models.md`](operations/admin-operations-read-models.md) |
| Catalog sync | [`operations/catalog-sync.md`](operations/catalog-sync.md) |
| Commerce smoke | [`operations/commerce-smoke.md`](operations/commerce-smoke.md) |
| Provider acceptance | [`operations/provider-acceptance.md`](operations/provider-acceptance.md) |
| Production deploy | [`operations/production-deploy.md`](operations/production-deploy.md) |
| VV Admin integration | [`operations/vv-admin-integration.md`](operations/vv-admin-integration.md) |
| Wallet reconciliation | [`operations/wallet-reconciliation.md`](operations/wallet-reconciliation.md) |
| Implementation roadmap | [`superpowers/plans/2026-07-27-vault-implementation-roadmap.md`](superpowers/plans/2026-07-27-vault-implementation-roadmap.md) |

## Product boundaries

Vault must sell only flows that are actually implemented:

- Users can buy Steam-traded game items through the internal Coins wallet.
- Users can enter a RUB amount for Steam account refill, see the Coins quote, and pay through the approved wallet/provider fulfillment path.
- GPT catalog entries must be hidden or marked unavailable until the API and fulfillment contract are supplied.
- If selling user inventory is not implemented against a real provider, public copy must not promise "покупайте и продавайте".
- Every customer-facing price and balance is in Coins. Fiat may appear only inside the top-up/refill explanation where legally/operationally required, never as a product catalog price.

## Documentation ownership

- `AGENTS.md`: short durable routing and non-negotiable rules.
- `docs/architecture/`: stable architecture, provider contracts, invariants.
- `docs/development/`: local workflow, agent coordination, command matrix.
- `docs/superpowers/plans/`: executable implementation sequence and acceptance gates.
- `frontend/docs/`: historical designer/implementation notes from the imported frontend. Use as context, not as production authority.

## Maintenance policy

Update the closest owning document with the code change. Keep root `AGENTS.md` lean and route details into `docs/`. Delete or rewrite stale current-state text rather than adding chronological corrections below it.
