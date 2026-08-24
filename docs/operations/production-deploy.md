# Production Deploy

Status: Vault single-server deployment runbook

Target:

- Frontend: `https://vaultapp24.com`
- API: `https://api.vaultapp24.com`
- Browser API/auth origin: `https://vaultapp24.com` through same-origin nginx routes.
- Server: `srv1925260`, `147.93.119.26`

## DNS

Required records:

```txt
A  @    147.93.119.26
A  api  147.93.119.26
A  www  147.93.119.26
```

TLS is terminated by the `nginx` container. Its config is mounted from
`/opt/nginx/conf.d`, certificates from `/opt/nginx/ssl`, and ACME challenges
from `/opt/nginx/challenges`. If `api.vaultapp24.com` does not resolve to the
server, API TLS and provider webhooks remain blocked.

## Files

Source is deployed by the self-hosted GitHub Actions runner checkout at
`/home/github-runner/actions-runner/_work/Vault/Vault`.

The frontend container uses two API origins:

- `VAULT_API_BASE_URL=http://backend:3000` for server-side rendering inside Docker.
- `NEXT_PUBLIC_API_BASE_URL=https://vaultapp24.com` for browser requests and Steam OpenID start links.

The backend `PUBLIC_BASE_URL` should also be `https://vaultapp24.com` so Steam OpenID callback cookies are issued on the same host the browser uses for frontend API requests. Keep `api.vaultapp24.com` available for direct provider webhooks and health checks.

The production Compose stack runs dedicated `fulfillment-worker` and `notifications-worker` services from the backend image. The fulfillment worker claims pending SIH fulfillment commands, executes Steam refill and skin submission commands, and reconciles submitted skin commands. The notifications worker polls the durable notification outbox and delivers email/Slack notifications. Do not scale either worker manually without confirming provider rate limits and database lock behavior.

Runtime config lives outside git:

- `/home/github-runner/.envs/vault/.env`
- `/opt/vault/secrets` for mounted secret files used by any future `*_FILE`
  entries.

Never commit, echo, screenshot, or paste `.env` or secret file contents.

The production `.env` must define at least these variable names:

```dotenv
NODE_ENV=production
IMAGE_TAG=latest
POSTGRES_USER=vault
POSTGRES_PASSWORD=[REDACTED_SECRET]
POSTGRES_DB=vault
BACKEND_PORT=3001
FRONTEND_PORT=3000
PUBLIC_BASE_URL=https://vaultapp24.com
PUBLIC_FRONTEND_ORIGIN=https://vaultapp24.com
NEXT_PUBLIC_API_BASE_URL=https://vaultapp24.com
VAULT_API_BASE_URL=http://backend:3000
REDIS_URL=redis://redis:6379
ADMIN_API_TOKEN=[REDACTED_SECRET]
ARC_PAY_ENVIRONMENT=production
ARC_PAY_PROVIDER_MODE=hosted
ARC_PAY_PUBLIC_ORIGIN=https://vaultapp24.com
ARC_PAY_SECRET_KEY=[REDACTED_SECRET]
ARC_PAY_WEBHOOK_SIGNING_SECRET=[REDACTED_SECRET]
SIH_API_KEY=[REDACTED_SECRET]
SIH_STEAM_REFILL_API_KEY=[REDACTED_SECRET]
STEAM_WEB_API_KEY=[REDACTED_SECRET]
PURELYMAIL_SMTP_USERNAME=support@vaultapp24.com
PURELYMAIL_SMTP_PASSWORD=[REDACTED_SECRET]
PURELYMAIL_SMTP_FROM=Vault <support@vaultapp24.com>
SLACK_APPLE_ORDERS_WEBHOOK_URL=[REDACTED_SECRET]
APPLE_GIFT_CARD_ENCRYPTION_KEY=[REDACTED_SECRET]
```

Purelymail delivery uses SMTP only for the current release. The worker treats SMTP acceptance as the send result; final mailbox delivery events are not collected.

If switching back to `DATABASE_URL` or `DATABASE_URL_FILE`, URL-encode the
password. Raw generated passwords may contain characters that are invalid inside
a PostgreSQL connection URL.

## Automatic deploy on push

Pushes to `main` run `.github/workflows/deploy.yml`.

The workflow:

1. runs backend verification, frontend tests/typecheck/build, and deploy-contract tests;
2. runs the deploy job on the production self-hosted runner labelled `vault-stage`;
3. copies `/home/github-runner/.envs/vault/.env` into the clean checkout as `.env`;
4. validates `docker-compose.yaml`, builds backend and frontend images, and starts Postgres/Redis;
5. applies migrations with `docker compose run --rm --no-deps backend npm run db:migrate`;
6. starts `backend`, `fulfillment-worker`, `notifications-worker`, `vv-admin-dispatcher-worker`, and `frontend` with `--wait --wait-timeout 180 --remove-orphans`;
7. verifies local and public health endpoints plus the VV Admin manifest.

The workflow does not store provider secrets. Runtime config stays outside git in
`/home/github-runner/.envs/vault/.env` and `/opt/vault/secrets`.

Cleanup deliberately excludes Docker volumes. Postgres, Redis, nginx data,
`/home/github-runner/.envs/vault`, `/opt/nginx`, `/opt/vault/volumes`, and
`/opt/vault/secrets` must remain untouched. Do not use `docker system prune -a`
here because it can remove tagged images that are not attached to a running
container.

## Manual commands

From `/home/github-runner/actions-runner/_work/Vault/Vault`:

```sh
cp /home/github-runner/.envs/vault/.env .env
docker compose config --quiet
docker compose build backend frontend
docker compose up -d postgres redis
docker compose run --rm --no-deps backend npm run db:migrate
docker compose up -d --wait --wait-timeout 180 --remove-orphans backend fulfillment-worker notifications-worker vv-admin-dispatcher-worker frontend
rm -f .env
```

Before building, `docker compose config --quiet` must pass. Do not print the
rendered config because it contains production environment values.

Health checks:

```sh
curl -fsS https://api.vaultapp24.com/health/live
curl -fsS https://api.vaultapp24.com/health/ready
curl -fsS https://vaultapp24.com/
```

Provider readiness:

```sh
docker compose exec backend npm run acceptance:readiness
```

Expected before SIH acceptance test data is configured: `sih-skin-test-order` and `sih-steam-refill` may remain blocked by missing test recipient variables. `arc-pay-hosted-checkout`, `arc-pay-webhook`, `sih-catalog`, and `steam-openid-browser` must be ready before release acceptance.

Manual one-cycle fulfillment processing, for incident recovery after checking the affected order and provider risk:

```sh
docker compose exec backend npm run fulfillment:worker -- --once
```

## Rollback

Create a source backup before manual production recovery:

```sh
backup="/opt/vault/backups/runner-checkout-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar --exclude=node_modules --exclude=frontend/.next --exclude=backend/dist \
  -czf "$backup" -C /home/github-runner/actions-runner/_work/Vault/Vault .
```

To rollback code from the source backup:

```sh
latest_backup="$(find /opt/vault/backups -mindepth 1 -maxdepth 1 -type f -name 'runner-checkout-*.tar.gz' | sort -r | head -n 1)"
cd /home/github-runner/actions-runner/_work/Vault/Vault
tar -xzf "$latest_backup" -C .
cp /home/github-runner/.envs/vault/.env .env
docker compose build backend frontend
docker compose up -d --wait --wait-timeout 180 --remove-orphans backend fulfillment-worker notifications-worker vv-admin-dispatcher-worker frontend
rm -f .env
```

For an emergency image-only rollback without rebuilding, inspect the rollback tag, retag it to the Compose image names, and restart without build:

```sh
docker image ls vault-backend vault-frontend
docker compose up -d --no-build --remove-orphans backend fulfillment-worker notifications-worker vv-admin-dispatcher-worker frontend
```

Do not rollback database migrations without a written data plan.
