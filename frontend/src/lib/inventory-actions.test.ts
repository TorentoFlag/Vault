import assert from "node:assert/strict";
import test from "node:test";

import { createSeedSteamAccountSnapshot } from "./marketplace-state.ts";
import { getInventoryItems } from "./account.ts";
import { sellInventoryItem, withdrawInventoryItem } from "./inventory-actions.ts";

test("production Steam seed snapshot does not expose local inventory actions", () => {
  const snapshot = createSeedSteamAccountSnapshot();
  assert.deepEqual(getInventoryItems(snapshot.orders), []);
  assert.equal(sellInventoryItem(snapshot, "missing-item").ok, false);
  assert.equal(withdrawInventoryItem(snapshot, "missing-item", "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEf12").ok, false);
});
