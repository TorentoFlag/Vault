#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/opt/vault/app}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/vault/backups}"
INCOMING_ROOT="${INCOMING_ROOT:-/opt/vault/deploy-incoming}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yaml}"
COMPOSE_WAIT_TIMEOUT="${COMPOSE_WAIT_TIMEOUT:-180}"
PUBLIC_HEALTH_RETRIES="${PUBLIC_HEALTH_RETRIES:-30}"
PUBLIC_HEALTH_SLEEP_SECONDS="${PUBLIC_HEALTH_SLEEP_SECONDS:-2}"
JOURNAL_VACUUM_SIZE="${JOURNAL_VACUUM_SIZE:-50M}"
DEPLOY_SHA="${VAULT_DEPLOY_SHA:-manual}"
RELEASE_DIR="${VAULT_RELEASE_DIR:?VAULT_RELEASE_DIR is required}"
ROLLBACK_IMAGE_PREFIX="${ROLLBACK_IMAGE_PREFIX:-vault-rollback}"

wait_for_url() {
  url="$1"
  attempt=1

  while [ "$attempt" -le "$PUBLIC_HEALTH_RETRIES" ]; do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi

    if [ "$attempt" -lt "$PUBLIC_HEALTH_RETRIES" ]; then
      sleep "$PUBLIC_HEALTH_SLEEP_SECONDS"
    fi

    attempt=$((attempt + 1))
  done

  curl -fsS "$url" >/dev/null
}

tag_current_image_for_rollback() {
  service="$1"
  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$service" || true)"
  if [ -z "$container_id" ]; then
    return 0
  fi

  image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  if [ -z "$image_id" ]; then
    return 0
  fi

  docker tag "$image_id" "$ROLLBACK_IMAGE_PREFIX-$service:$timestamp-$short_sha"
}

cleanup_old_rollback_images() {
  service="$1"
  repository="$ROLLBACK_IMAGE_PREFIX-$service"

  docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' \
    | sort -r \
    | tail -n +2 \
    | while IFS= read -r old_image; do
        if [ -n "$old_image" ]; then
          docker image rm "$old_image" || true
        fi
      done
}

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
tag_current_image_for_rollback backend
tag_current_image_for_rollback frontend
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d postgres redis
docker compose -f "$COMPOSE_FILE" run --rm backend npm run db:migrate
docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout "$COMPOSE_WAIT_TIMEOUT"

wait_for_url https://api.vaultapp24.com/health/live
wait_for_url https://api.vaultapp24.com/health/ready
wait_for_url https://vaultapp24.com/

docker compose -f "$COMPOSE_FILE" ps

cleanup_old_rollback_images backend
cleanup_old_rollback_images frontend
docker image prune -f
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
