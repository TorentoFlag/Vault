# Vault documentation

This is the entry point for humans and agents. Documentation describes current intended behavior; Git history will record the past after the root repository is initialized.

## Current project state

- Root Git repository: initialized on `main`.
- `frontend/.git`: removed; `frontend/` is now a normal project folder.
- Frontend: Next.js 16, React 19, TypeScript, CSS Modules, backend-fed public catalog pages with remaining local concept flows.
- Current frontend coverage: backend-fed home/catalog/product surfaces, Coins, local cart, checkout gate, account, purchase history, inventory, Steam Trade URL form, support draft, legal routes, footer payment logos, FAQ, and search.
- Current backend coverage: Steam session foundation, backend-fed catalog/pricing, initial Coins wallet ledger/holds, and checkout order creation from wallet balance.
- Current frontend limitation: no production Arc Pay payment, no real Steam OpenID browser acceptance, no real SIH purchase/refill, and cart/account history still use local concept state.
- First release scope: skin purchase and Steam account refill only.
- Deferred scope: GPT refill until provider API and product rules are supplied.

## Start here

| Need | Read |
| --- | --- |
| Durable architecture | [`architecture/project-architecture.md`](architecture/project-architecture.md) |
| Provider findings | [`architecture/provider-research.md`](architecture/provider-research.md) |
| Agent workflow | [`development/agent-workflow.md`](development/agent-workflow.md) |
| Command matrix | [`development/commands.md`](development/commands.md) |
| Implementation roadmap | [`superpowers/plans/2026-07-27-vault-implementation-roadmap.md`](superpowers/plans/2026-07-27-vault-implementation-roadmap.md) |

## Product boundaries

Vault must sell only flows that are actually implemented:

- Users can buy Steam-traded game items through the internal Coins wallet.
- Users can pay for Steam account refill through the approved provider path.
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
