import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
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
  assert.match(remoteScript, /docker system prune -af/);
  assert.match(remoteScript, /docker builder prune -af/);
  assert.doesNotMatch(remoteScript, /--volumes/);
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

test("frontend Dockerfile does not require generated gitignored Next.js files", () => {
  assert.doesNotMatch(frontendDockerfile, /COPY[^\n]*next-env\.d\.ts/);
});
