import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const compose = readFileSync(new URL("../compose.prod.yaml", import.meta.url), "utf8");
const frontendDockerfile = readFileSync(new URL("../frontend/Dockerfile", import.meta.url), "utf8");

test("workflow deploys production only after validation through SSH secrets", () => {
  assert.match(workflow, /^name:\s+Deploy Vault production/m);
  assert.match(workflow, /branches:\s+\[main\]/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /needs:\s+validate/);
  assert.match(workflow, /environment:\s+production/);
  assert.match(workflow, /VAULT_DEPLOY_SSH_KEY/);
  assert.match(workflow, /VAULT_DEPLOY_KNOWN_HOSTS/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /rsync[\s\S]*--delete/);
  assert.doesNotMatch(workflow, /sshpass|password/i);
});

test("workflow validates both backend and frontend before deploy", () => {
  assert.match(workflow, /npm --prefix backend ci/);
  assert.match(workflow, /npm --prefix backend run verify/);
  assert.match(workflow, /npm --prefix frontend ci/);
  assert.match(workflow, /npm --prefix frontend test/);
  assert.match(workflow, /npm --prefix frontend run typecheck/);
  assert.match(workflow, /npm --prefix frontend run build/);
});

const remoteScript = readFileSync(new URL("./production-remote-deploy.sh", import.meta.url), "utf8");

test("remote deploy script keeps exactly one rollback backup and never prunes volumes", () => {
  assert.match(remoteScript, /BACKUP_ROOT=/);
  assert.match(remoteScript, /cp -a "\$APP_DIR" "\$backup_dir"/);
  assert.match(remoteScript, /\[ "\$release_path" != "\$app_path" \]/);
  assert.match(remoteScript, /tail -n \+2[\s\S]*rm -rf --/);
  assert.match(remoteScript, /docker image prune -f/);
  assert.match(remoteScript, /docker builder prune -af/);
  assert.doesNotMatch(remoteScript, /docker system prune -af/);
  assert.doesNotMatch(remoteScript, /--volumes/);
});

test("remote deploy script keeps only the latest rollback Docker images", () => {
  assert.match(remoteScript, /ROLLBACK_IMAGE_PREFIX=/);
  assert.match(remoteScript, /tag_current_image_for_rollback\(\)/);
  assert.match(remoteScript, /tag_current_image_for_rollback backend/);
  assert.match(remoteScript, /tag_current_image_for_rollback frontend/);
  assert.match(remoteScript, /cleanup_old_rollback_images\(\)/);
  assert.match(remoteScript, /cleanup_old_rollback_images backend/);
  assert.match(remoteScript, /cleanup_old_rollback_images frontend/);
  assert.match(remoteScript, /docker image rm "\$old_image"/);
  assert.match(remoteScript, /docker image prune -f/);
  assert.doesNotMatch(remoteScript, /docker image prune -af/);
  assert.doesNotMatch(remoteScript, /docker system prune -af/);
});

test("remote deploy script gates deployment with migrations, compose wait, and public health checks", () => {
  assert.match(remoteScript, /docker compose -f "\$COMPOSE_FILE" config/);
  assert.match(remoteScript, /npm run db:migrate/);
  assert.match(remoteScript, /up -d --wait --wait-timeout/);
  assert.match(remoteScript, /wait_for_url\(\)/);
  assert.match(remoteScript, /PUBLIC_HEALTH_RETRIES=/);
  assert.match(remoteScript, /https:\/\/api\.vaultapp24\.com\/health\/live/);
  assert.match(remoteScript, /https:\/\/api\.vaultapp24\.com\/health\/ready/);
  assert.match(remoteScript, /https:\/\/vaultapp24\.com\//);
});

test("production compose runs a dedicated fulfillment worker", () => {
  assert.match(compose, /\n  fulfillment-worker:\n/);
  assert.match(compose, /command:\s+\["node", "dist\/fulfillment-worker\.js"\]/);
  assert.match(compose, /DATABASE_URL_FILE: \/run\/secrets\/vault\/database-url/);
});

test("production compose runs a persistent notifications worker", () => {
  assert.match(compose, /\n  notifications-worker:\n/);
  assert.match(compose, /command:\s+\["node", "dist\/notifications-worker\.js", "--watch"\]/);
});

test("frontend Dockerfile does not require generated gitignored Next.js files", () => {
  assert.doesNotMatch(frontendDockerfile, /COPY[^\n]*next-env\.d\.ts/);
});
