# Production Deploy

Status: Vault single-server deployment runbook

Target:

- Frontend: `https://vaultapp24.com`
- API: `https://api.vaultapp24.com`
- Browser API/auth origin: `https://vaultapp24.com` through same-origin Caddy routes.
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
- `NEXT_PUBLIC_API_BASE_URL=https://vaultapp24.com` for browser requests and Steam OpenID start links.

The backend `PUBLIC_BASE_URL` should also be `https://vaultapp24.com` so Steam OpenID callback cookies are issued on the same host the browser uses for frontend API requests. Keep `api.vaultapp24.com` available for direct provider webhooks and health checks.

The production Compose stack runs dedicated `fulfillment-worker` and `notifications-worker` services from the backend image. The fulfillment worker claims pending SIH fulfillment commands, executes Steam refill and skin submission commands, and reconciles submitted skin commands. The notifications worker polls the durable notification outbox and delivers email/Slack notifications. Do not scale either worker manually without confirming provider rate limits and database lock behavior.

Runtime config lives outside git:

- `/opt/vault/env/backend.env`
- `/opt/vault/secrets/database-url`
- `/opt/vault/secrets/postgres-password`
- `/opt/vault/secrets/admin-api-token`
- `/opt/vault/secrets/arc-pay-secret-key`
- `/opt/vault/secrets/arc-pay-webhook-secret`
- `/opt/vault/secrets/sih-api-key`
- `/opt/vault/secrets/sih-steam-refill-api-key`
- `/opt/vault/secrets/purelymail-smtp-password`
- `/opt/vault/secrets/slack-apple-orders-webhook`
- `/opt/vault/secrets/apple-gift-card-encryption-key`

Never commit, echo, screenshot, or paste secret file contents.

Apple gift-card notifications require these backend environment entries:

```dotenv
PURELYMAIL_SMTP_USERNAME=support@vaultapp24.com
PURELYMAIL_SMTP_PASSWORD_FILE=/run/secrets/vault/purelymail-smtp-password
PURELYMAIL_SMTP_FROM=Vault <support@vaultapp24.com>
# Optional defaults:
# PURELYMAIL_SMTP_HOST=smtp.purelymail.com
# PURELYMAIL_SMTP_PORT=465
# PURELYMAIL_SMTP_SECURE=true
SLACK_APPLE_ORDERS_WEBHOOK_URL_FILE=/run/secrets/vault/slack-apple-orders-webhook
APPLE_GIFT_CARD_ENCRYPTION_KEY_FILE=/run/secrets/vault/apple-gift-card-encryption-key
```

Purelymail delivery uses SMTP only for the current release. The worker treats SMTP acceptance as the send result; final mailbox delivery events are not collected.

When deriving `/opt/vault/secrets/database-url` from `/opt/vault/secrets/postgres-password`, URL-encode the password. Raw generated passwords may contain characters that are invalid inside a PostgreSQL connection URL.

```sh
node -e 'const fs=require("node:fs"); const password=fs.readFileSync("/opt/vault/secrets/postgres-password","utf8").trim(); fs.writeFileSync("/opt/vault/secrets/database-url", `postgres://vault:${encodeURIComponent(password)}@postgres:5432/vault\n`, { mode: 0o600 });'
```

## Automatic deploy on push

Pushes to `main` run `.github/workflows/deploy.yml`.

The workflow:

1. runs backend verification, frontend tests/typecheck/build, and deploy-contract tests;
2. uploads the exact GitHub Actions checkout to `/opt/vault/deploy-incoming/<sha>` by `rsync`;
3. runs `deploy/production-remote-deploy.sh` on the server;
4. backs up the current `/opt/vault/app` into `/opt/vault/backups/app-<timestamp>-<sha>`;
5. keeps only the newest rollback backup and deletes older app backups;
6. tags the currently running backend and frontend images as the rollback image set;
7. builds images, applies migrations, starts Compose with `--wait`, checks public health endpoints, keeps only the newest rollback image per app image, and then prunes dangling Docker images/build cache.

Required GitHub Secrets:

- `VAULT_DEPLOY_HOST`: `38.180.243.42`
- `VAULT_DEPLOY_USER`: SSH user used for deploy
- `VAULT_DEPLOY_PORT`: optional, defaults to `22`
- `VAULT_DEPLOY_SSH_KEY`: private deploy key authorized on the server
- `VAULT_DEPLOY_KNOWN_HOSTS`: pinned `known_hosts` entry for the server

The workflow does not store provider secrets. Runtime config stays outside git in `/opt/vault/env` and `/opt/vault/secrets`.

Cleanup deliberately excludes Docker volumes. Postgres, Redis, Caddy data, `/opt/vault/env`, and `/opt/vault/secrets` must remain untouched. Successful deploys keep only the latest `vault-rollback-backend:*` and `vault-rollback-frontend:*` tags; older rollback tags, dangling images, and build cache are removed. Do not use `docker system prune -a` here because it also deletes tagged rollback images that are not attached to a running container.

## Manual commands

From `/opt/vault/app`:

```sh
VAULT_RELEASE_DIR=/opt/vault/app VAULT_DEPLOY_SHA=manual sh deploy/production-remote-deploy.sh
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

Manual one-cycle fulfillment processing, for incident recovery after checking the affected order and provider risk:

```sh
docker compose -f compose.prod.yaml exec backend npm run fulfillment:worker -- --once
```

## Rollback

The deploy keeps exactly one previous app backup under `/opt/vault/backups` and one previous Docker image set under `vault-rollback-backend:*` and `vault-rollback-frontend:*`.

To rollback code from the source backup:

```sh
latest_backup="$(find /opt/vault/backups -mindepth 1 -maxdepth 1 -type d -name 'app-*' | sort -r | head -n 1)"
rsync -a --delete "$latest_backup"/ /opt/vault/app/
cd /opt/vault/app
docker compose -f compose.prod.yaml build
docker compose -f compose.prod.yaml up -d --wait --wait-timeout 180
```

For an emergency image-only rollback without rebuilding, inspect the rollback tag, retag it to the Compose image names, and restart without build:

```sh
rollback_tag="$(docker image ls vault-rollback-backend --format '{{.Tag}}' | sort -r | head -n 1)"
docker tag "vault-rollback-backend:$rollback_tag" vault-backend
docker tag "vault-rollback-frontend:$rollback_tag" vault-frontend
docker compose -f compose.prod.yaml up -d --no-build --wait --wait-timeout 180
```

Do not rollback database migrations without a written data plan.
