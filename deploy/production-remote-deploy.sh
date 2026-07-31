#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/vault/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/vault/backups}"
INCOMING_ROOT="${INCOMING_ROOT:-/opt/vault/deploy-incoming}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
COMPOSE_WAIT_TIMEOUT="${COMPOSE_WAIT_TIMEOUT:-180}"
JOURNAL_VACUUM_SIZE="${JOURNAL_VACUUM_SIZE:-50M}"
DEPLOY_SHA="${VAULT_DEPLOY_SHA:-manual}"
RELEASE_DIR="${VAULT_RELEASE_DIR:?VAULT_RELEASE_DIR is required}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
short_sha="$(printf '%s' "$DEPLOY_SHA" | cut -c 1-12 | tr -c 'A-Za-z0-9._-' '-')"
backup_dir="$BACKUP_ROOT/app-$timestamp-$short_sha"

mkdir -p "$BACKUP_ROOT" "$APP_DIR"

cp -a "$APP_DIR" "$backup_dir"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'app-*' \
  | sort -r \
  | tail -n +2 \
  | xargs -r rm -rf --

release_path="$(cd "$RELEASE_DIR" && pwd -P)"
app_path="$(cd "$APP_DIR" && pwd -P)"
if [ "$release_path" != "$app_path" ]; then
  rsync -a --delete \
    --exclude='.git/' \
    --exclude='.secrets/' \
    --exclude='node_modules/' \
    --exclude='frontend/.next/' \
    --exclude='backend/dist/' \
    --exclude='.DS_Store' \
    "$RELEASE_DIR"/ "$APP_DIR"/
fi

rm -rf "$APP_DIR/.secrets"

cd "$APP_DIR"

docker compose -f "$COMPOSE_FILE" config | grep -q 'DATABASE_URL_FILE'
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d postgres redis
docker compose -f "$COMPOSE_FILE" run --rm backend npm run db:migrate
docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout "$COMPOSE_WAIT_TIMEOUT"

curl -fsS https://api.vaultapp24.com/health/live >/dev/null
curl -fsS https://api.vaultapp24.com/health/ready >/dev/null
curl -fsS https://vaultapp24.com/ >/dev/null

docker compose -f "$COMPOSE_FILE" ps

docker system prune -af
docker builder prune -af

if command -v apt-get >/dev/null 2>&1; then
  apt-get clean
  find /var/lib/apt/lists -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
fi

if command -v journalctl >/dev/null 2>&1; then
  journalctl --vacuum-size="$JOURNAL_VACUUM_SIZE" >/dev/null || true
fi

find "$INCOMING_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +

df -h /
docker system df
