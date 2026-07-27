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
| SIH sandbox catalog acceptance | `SIH_API_KEY_FILE=/absolute/restricted/sih-key npm --prefix backend run test:integration -- src/modules/providers/sih/sih.sandbox.integration.spec.ts` |
| Full backend gate | `npm --prefix backend run verify` |

## Local stack commands

| Purpose | Command |
| --- | --- |
| Core dependencies | `docker compose -f compose.dev.yaml up -d --wait postgres redis` |
| Integration dependencies | `docker compose -f compose.dev.yaml --profile integration up -d --wait postgres-test redis-test` |

Vault maps PostgreSQL to host port `55432` and Redis to host port `56379` so it can run beside other Finext projects that already use `5432` and `6379`.

Run `DATABASE_URL=postgres://vault_test:vault_test_password@localhost:55433/vault_test npm --prefix backend run db:migrate` before integration tests when migrations changed or the test database is fresh.

Keep `SIH_API_KEY_FILE` outside the repository and do not print its contents. The SIH sandbox acceptance test is skipped unless the file path is explicitly provided.

When a script name changes in code, update this file and every runbook/plan that references it in the same change.
