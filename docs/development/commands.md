# Command Matrix

Commands are separated into current and planned state so agents do not invent tooling.

## Current root state

The root directory is a Git repository on `main` with `origin` set to `https://github.com/TorentoFlag/Vault.git`.

## Frontend commands

Run from `/Users/anton/Finext/Vault`.

| Purpose | Command | Notes |
| --- | --- | --- |
| Install frontend dependencies | `npm --prefix frontend ci` | Uses committed `frontend/package-lock.json`. |
| Start frontend dev server | `npm --prefix frontend run dev` | Next.js dev server. |
| Run unit tests | `npm --prefix frontend test` | Node test runner over `src/**/*.test.ts`. |
| Type check | `npm --prefix frontend run typecheck` | Requires installed dependencies. |
| Lint | `npm --prefix frontend run lint` | ESLint/Next config. |
| Production build | `npm --prefix frontend run build` | Use before visual/browser verification. |
| Sync API contract snapshot | `npm --prefix frontend run api:sync` | Copies backend OpenAPI into `frontend/src/generated/api-contract.json` after `openapi:generate`. |

## Backend commands

| Purpose | Command |
| --- | --- |
| Install backend dependencies | `npm --prefix backend ci` |
| Backend dev API | `npm --prefix backend run dev` |
| Backend unit tests | `npm --prefix backend test` |
| Backend type check | `npm --prefix backend run typecheck` |
| Backend lint | `npm --prefix backend run lint` |
| Backend build | `npm --prefix backend run build` |
| Generate OpenAPI | `npm --prefix backend run openapi:generate` |
| Check OpenAPI freshness | `npm --prefix backend run openapi:check` |
| Generate DB migration | `npm --prefix backend run db:generate -- --name=<name>` |
| Apply DB migration | `npm --prefix backend run db:migrate` |
| Backend integration tests | `npm --prefix backend run test:integration` |
| Commerce smoke | `npm --prefix backend run smoke:commerce` |
| Provider acceptance readiness | `npm --prefix backend run acceptance:readiness` |
| Sync SIH supplier listings | `SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run catalog:sync-sih -- --game=cs2` |
| Sync catalog metadata | `npm --prefix backend run catalog:sync-metadata -- --game=cs2` |
| Sync all public catalog games | `SIH_API_KEY_FILE=/absolute/restricted/sih-key CATALOG_PUBLIC_GAMES=cs2,rust,tf2 npm --prefix backend run catalog:sync-all-games` |
| Promote covered SIH listings | `npm --prefix backend run catalog:promote-sih -- --game=cs2` |
| Reconcile pending Arc Pay top-ups | `npm --prefix backend run payments:reconcile -- --limit=20` |
| Check wallet invariants | `npm --prefix backend run wallet:reconcile -- --limit=100` |
| SIH sandbox catalog acceptance | `SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run acceptance:sih-catalog` |
| Full backend gate | `npm --prefix backend run verify` |

## Local stack commands

| Purpose | Command |
| --- | --- |
| Core dependencies | `docker compose -f compose.dev.yaml up -d --wait postgres redis` |
| Integration dependencies | `docker compose -f compose.dev.yaml --profile integration up -d --wait postgres-test redis-test` |

Vault maps PostgreSQL to host port `55432` and Redis to host port `56379` so it can run beside other Finext projects that already use `5432` and `6379`.

Run `DATABASE_URL=postgres://vault_test:vault_test_password@localhost:55433/vault_test npm --prefix backend run db:migrate` before integration tests when migrations changed or the test database is fresh.

Keep `STEAM_WEB_API_KEY_FILE`, `SIH_API_KEY_FILE`, `ADMIN_API_TOKEN_FILE`, Arc Pay API keys, webhook secrets, and SIH acceptance trade-token files outside the repository and do not print their contents. Steam OpenID challenge verification does not require the Steam Web API key; use the key only for backend-side Steam Web API/profile/provider calls when that adapter needs it. The SIH sandbox acceptance test is skipped unless the file path is explicitly provided. `acceptance:readiness` prints only variable/gate names and exits nonzero until every real provider gate has its required public origins and secret files.

## HTTPS browser/provider acceptance

Steam OpenID and Arc Pay Hosted Checkout need public HTTPS origins. For local browser acceptance, use Cloudflare quick tunnels for the browser-facing frontend and backend:

| Purpose | Command |
| --- | --- |
| Frontend HTTPS tunnel | `npm exec --yes cloudflared -- tunnel --url http://127.0.0.1:3000` |
| Backend HTTPS tunnel | `npm exec --yes cloudflared -- tunnel --url http://127.0.0.1:3004` |

Then set local backend env values to the tunnel origins:

- `PUBLIC_BASE_URL=<backend https origin>`
- `PUBLIC_FRONTEND_ORIGIN=<frontend https origin>`
- `ARC_PAY_PUBLIC_ORIGIN=<frontend https origin>`
- `CORS_ORIGINS=<frontend https origin>`

Build/start the frontend with the backend origin:

```sh
NEXT_PUBLIC_API_BASE_URL=<backend https origin> npm --prefix frontend run build
NEXT_PUBLIC_API_BASE_URL=<backend https origin> npm --prefix frontend run start -- -p 3000
```

Use `hookdeck listen` only for provider webhooks. Localtunnel can be useful for simple HTTP checks, but it has a browser interstitial and may return 429/502 for Next static chunks, so do not use it as final browser acceptance evidence.

When a script name changes in code, update this file and every runbook/plan that references it in the same change.
