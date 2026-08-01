import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), "SteamRefillForm.tsx");
const source = readFileSync(sourcePath, "utf8");

test("Steam refill form does not render the extra Vault checkout provider card", () => {
  assert.equal(source.includes("Оформление через корзину Vault"), false);
  assert.equal(source.includes("Логин Steam будет указан на шаге оформления заказа."), false);
  assert.equal(source.includes("steamRefillMethod"), false);
});
