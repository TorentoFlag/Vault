# Vault agent instructions

## Mission

Vault is a digital-goods catalog for Steam account refills and Steam-traded game items. GPT refill stays out of the first release until the provider API and product decision are supplied.

The existing `frontend/` app is visual/product input from the designer. Preserve its visual language where possible, but do not treat localStorage mocks, local balances, local orders, or demo auth as production contracts. The backend will own identity, catalog, prices, wallet, checkout, payments, fulfillment, history, and legal/public configuration.

## Read before non-trivial work

1. Read `docs/README.md`.
2. Read `docs/development/agent-workflow.md`.
3. Read `docs/architecture/project-architecture.md` and `docs/architecture/provider-research.md`.
4. Read the relevant implementation plan under `docs/superpowers/plans/`.
5. Check `git status --short` if a root repository exists. If no root Git repository exists, state that before any commit/push claim.
6. Check the closest nested `AGENTS.md` if one is added later.

## Source of truth

Use this order:

1. Executable code, migrations, tests, generated OpenAPI, and provider acceptance evidence once they exist.
2. `docs/architecture/project-architecture.md` for durable system decisions.
3. `docs/superpowers/plans/2026-07-27-vault-implementation-roadmap.md` for implementation order.
4. Focused documents under `docs/development/` and `docs/architecture/`.
5. `frontend/` for visual direction and current UX inventory only.

When docs and code drift, establish intended behavior from tests/specs, fix the owning source, and update the closest current document in the same change.

## Non-negotiable rules

- One repository with top-level `backend/` and `frontend/`.
- Standard NestJS modular-monolith backend unless a later approved design changes it.
- PostgreSQL is authoritative. Redis/BullMQ may transport work, never own money/order truth.
- Backend owns money, prices, cart, checkout, order, fulfillment, user history, and account state.
- Frontend types must come from backend OpenAPI after the backend exists.
- All product prices and customer balances are denominated in internal Coins.
- No dollar symbol in customer-facing UI.
- Money/rates use integer minor/scaled units; no floating-point domain arithmetic.
- External effects require durable attempts, idempotency, inbox/outbox, reconciliation, and redacted evidence.
- No network call inside an open database transaction.
- Steam skin checkout requires Steam identity plus valid Steam Trade URL.
- Arc Pay and SIH secrets stay backend-only and must never enter client code, logs, screenshots, or docs.
- Do not claim real payment, Steam refill, SIH purchase, or trade delivery without provider evidence plus database proof.

## Working method

- Use TDD for implementation: failing focused test, observed failure, minimal implementation, passing focused test, then broader verification.
- Keep feature-specific view/model logic out of JSX where it grows beyond presentation.
- Preserve unrelated user changes. Never reset, checkout, or clean them away.
- Use `apply_patch` for hand edits.
- Do not edit generated OpenAPI/client files manually.
- After backend OpenAPI changes, run `npm --prefix frontend run api:sync` and verify frontend tests/typecheck.
- Do not add dependencies casually; explain why existing/platform capability is insufficient.
- Do not deploy, rotate secrets, alter production data, push, or create a PR unless the user explicitly requests that external action.

## Agent delegation

All agents work in the shared checkout unless the coordinator explicitly creates a different workspace. Parallel work is allowed only after interfaces and path ownership are written down in `.agents/coordination.md`. Only the coordinator edits that ledger.

Serialize shared work: package files, migrations, schema aggregators, generated OpenAPI/client artifacts, root configuration, global styles, staging, commits, and deployment.

Worker agents return changed paths and exact verification evidence. The coordinator reviews diffs and reruns verification before claiming completion.

## Current frontend commands

Run from the repository root:

- Install dependencies: `npm --prefix frontend ci`
- Unit tests: `npm --prefix frontend test`
- Type check: `npm --prefix frontend run typecheck`
- Lint: `npm --prefix frontend run lint`
- Build: `npm --prefix frontend run build`
- Sync API contract snapshot: `npm --prefix frontend run api:sync`

## Current backend commands

- Install dependencies: `npm --prefix backend ci`
- Unit tests: `npm --prefix backend test`
- Type check: `npm --prefix backend run typecheck`
- Lint: `npm --prefix backend run lint`
- Build: `npm --prefix backend run build`
- Generate OpenAPI: `npm --prefix backend run openapi:generate`
- Check OpenAPI freshness: `npm --prefix backend run openapi:check`
- Generate DB migration: `npm --prefix backend run db:generate -- --name=<name>`
- Apply DB migration: `npm --prefix backend run db:migrate`
- Integration tests: `npm --prefix backend run test:integration`
- Commerce smoke: `npm --prefix backend run smoke:commerce`
- Reconcile pending Arc Pay top-ups: `npm --prefix backend run payments:reconcile -- --limit=20`
- Check wallet invariants: `npm --prefix backend run wallet:reconcile -- --limit=100`
- Provider acceptance readiness: `npm --prefix backend run acceptance:readiness`
- SIH sandbox catalog acceptance: `SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run acceptance:sih-catalog`
- Full gate: `npm --prefix backend run verify`
- Dev dependencies: `docker compose -f compose.dev.yaml up -d --wait postgres redis`
- Integration dependencies: `docker compose -f compose.dev.yaml --profile integration up -d --wait postgres-test redis-test`

Never echo, commit, or paste `SIH_API_KEY_FILE` contents. SIH sandbox acceptance evidence may include only nonsecret counts, game ids, request ids, and hashed item identities. Run `acceptance:readiness` before live/sandbox provider acceptance and treat blocked gates as unreleased until provider evidence plus database proof exists.
