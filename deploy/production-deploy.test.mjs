import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const compose = readFileSync(new URL("../docker-compose.yaml", import.meta.url), "utf8");
const frontendDockerfile = readFileSync(new URL("../frontend/Dockerfile", import.meta.url), "utf8");

test("workflow deploys production only after validation on the self-hosted server runner", () => {
  assert.match(workflow, /^name:\s+Deploy Vault production/m);
  assert.match(workflow, /branches:\s+\[main\]/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /needs:\s+validate/);
  assert.match(workflow, /environment:\s+production/);
  assert.match(workflow, /runs-on:\s+\[self-hosted, vault-stage\]/);
  assert.match(workflow, /cp ~\/\.envs\/vault\/\.env \.env/);
  assert.match(workflow, /docker compose config --quiet/);
  assert.match(workflow, /docker compose build backend frontend/);
  assert.match(workflow, /docker compose run --rm --no-deps backend npm run db:migrate/);
  assert.match(workflow, /docker compose up -d --wait --wait-timeout 180 --remove-orphans backend fulfillment-worker notifications-worker vv-admin-dispatcher-worker frontend/);
  assert.match(workflow, /https:\/\/api\.vaultapp24\.com\/health\/ready/);
  assert.doesNotMatch(workflow, /VAULT_DEPLOY_SSH_KEY|VAULT_DEPLOY_KNOWN_HOSTS|sshpass/);
});

test("workflow validates both backend and frontend before deploy", () => {
  assert.match(workflow, /npm --prefix backend ci/);
  assert.match(workflow, /npm --prefix backend run verify/);
  assert.match(workflow, /npm --prefix frontend ci/);
  assert.match(workflow, /npm --prefix frontend test/);
  assert.match(workflow, /npm --prefix frontend run typecheck/);
  assert.match(workflow, /npm --prefix frontend run build/);
});

test("production compose runs a dedicated fulfillment worker", () => {
  assert.match(compose, /\n  fulfillment-worker:\n/);
  assert.match(compose, /command:\s+\["node", "dist\/fulfillment-worker\.js"\]/);
  assert.match(compose, /DATABASE_URL: postgres:\/\/\$\{POSTGRES_USER\}:\$\{POSTGRES_PASSWORD\}@postgres:5432\/\$\{POSTGRES_DB\}/);
});

test("production compose runs a persistent notifications worker", () => {
  assert.match(compose, /\n  notifications-worker:\n/);
  assert.match(compose, /command:\s+\["node", "dist\/notifications-worker\.js", "--watch"\]/);
});

test("production compose runs a persistent VV Admin dispatcher worker", () => {
  assert.match(compose, /\n  vv-admin-dispatcher-worker:\n/);
  assert.match(compose, /command:\s+\["node", "dist\/vv-admin-dispatcher-worker\.js", "--watch"\]/);
  assert.match(compose, /VV_ADMIN_DISPATCHER_INTERVAL_MS: "10000"/);
});

test("production compose does not run the removed currency rates worker", () => {
  assert.doesNotMatch(compose, /currency-rates-worker/);
  assert.doesNotMatch(compose, /dist\/currency-rates-worker\.js/);
});

test("production compose does not require a removed Dockerfile migrate stage", () => {
  assert.doesNotMatch(compose, /target:\s*migrate/);
  assert.doesNotMatch(compose, /profiles:\s+\["migration"\]/);
});

test("frontend Dockerfile does not require generated gitignored Next.js files", () => {
  assert.doesNotMatch(frontendDockerfile, /COPY[^\n]*next-env\.d\.ts/);
});
