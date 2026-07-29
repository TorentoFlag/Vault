# Production Deploy

Status: Vault single-server deployment runbook

Target:

- Frontend: `https://vaultapp24.com`
- API: `https://api.vaultapp24.com`
- Server: `/opt/vault`

## DNS

Required records:

```txt
A  @    38.180.243.42
A  api  38.180.243.42
A  www  38.180.243.42
```

TLS is issued by Caddy. If `api.vaultapp24.com` does not resolve to the server, API TLS and provider webhooks remain blocked.

## Files

Source is deployed to `/opt/vault/app`.

The frontend container uses two API origins:

- `VAULT_API_BASE_URL=http://backend:3000` for server-side rendering inside Docker.
- `NEXT_PUBLIC_API_BASE_URL=https://api.vaultapp24.com` for browser requests.

Runtime config lives outside git:

- `/opt/vault/env/backend.env`
- `/opt/vault/secrets/database-url`
- `/opt/vault/secrets/postgres-password`
- `/opt/vault/secrets/admin-api-token`
- `/opt/vault/secrets/arc-pay-secret-key`
- `/opt/vault/secrets/arc-pay-webhook-secret`
- `/opt/vault/secrets/sih-api-key`

Never commit, echo, screenshot, or paste secret file contents.

When deriving `/opt/vault/secrets/database-url` from `/opt/vault/secrets/postgres-password`, URL-encode the password. Raw generated passwords may contain characters that are invalid inside a PostgreSQL connection URL.

```sh
node -e 'const fs=require("node:fs"); const password=fs.readFileSync("/opt/vault/secrets/postgres-password","utf8").trim(); fs.writeFileSync("/opt/vault/secrets/database-url", `postgres://vault:${encodeURIComponent(password)}@postgres:5432/vault\n`, { mode: 0o600 });'
```

## Commands

From `/opt/vault/app`:

```sh
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d postgres redis
docker compose -f compose.prod.yaml run --rm backend npm run db:migrate
docker compose -f compose.prod.yaml up -d
docker compose -f compose.prod.yaml ps
```

Before building, `docker compose -f compose.prod.yaml config` must show `DATABASE_URL_FILE`, not a literal `DATABASE_URL` containing credentials.

Health checks:

```sh
curl -fsS https://api.vaultapp24.com/health/live
curl -fsS https://api.vaultapp24.com/health/ready
curl -fsS https://vaultapp24.com/
```

Provider readiness:

```sh
docker compose -f compose.prod.yaml exec backend npm run acceptance:readiness
```

Expected before SIH acceptance test data is configured: `sih-skin-test-order` and `sih-steam-refill` may remain blocked by missing test recipient variables. `arc-pay-hosted-checkout`, `arc-pay-webhook`, `sih-catalog`, and `steam-openid-browser` must be ready before release acceptance.

## Rollback

Keep the previous `/opt/vault/app` copy or Git commit hash before updating. To rollback:

```sh
cd /opt/vault/app
git checkout <known-good-commit>
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d
```

Do not rollback database migrations without a written data plan.
