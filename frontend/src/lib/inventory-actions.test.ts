import assert from "node:assert/strict";
import test from "node:test";

import { createSeedSteamAccountSnapshot } from "./marketplace-state.ts";
import { getInventoryItems } from "./account.ts";
import { sellInventoryItem, withdrawInventoryItem } from "./inventory-actions.ts";

test("selling an inventory item credits Coins once and records a linked sale", () => {
  const snapshot = createSeedSteamAccountSnapshot();
  const item = getInventoryItems(snapshot.orders)[0];
  assert.ok(item);

  const first = sellInventoryItem(snapshot, item.id, "2026-07-17T12:00:00.000Z");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.snapshot.balanceCoins, snapshot.balanceCoins + item.priceCoins);
  assert.equal(first.snapshot.transactions.filter((entry) => entry.reason === "sale").length, 1);
  assert.equal(first.snapshot.tradeEvents.filter((entry) => entry.direction === "sale" && entry.itemId === item.id).length, 1);
  assert.equal(getInventoryItems(first.snapshot.orders, first.snapshot.tradeEvents).some((entry) => entry.id === item.id), false);

  const duplicate = sellInventoryItem(first.snapshot, item.id, "2026-07-17T12:01:00.000Z");
  assert.equal(duplicate.ok, false);
});

test("withdrawal requires a valid Steam Trade URL and records a local processing event", () => {
  const snapshot = createSeedSteamAccountSnapshot();
  const item = getInventoryItems(snapshot.orders)[0];
  assert.ok(item);
  const invalid = withdrawInventoryItem(snapshot, item.id, "");
  assert.equal(invalid.ok, false);
  const valid = withdrawInventoryItem(snapshot, item.id, "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEf12", "2026-07-17T12:00:00.000Z");
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  const event = valid.snapshot.tradeEvents.find((entry) => entry.direction === "withdrawal" && entry.itemId === item.id);
  assert.equal(event?.status, "processing");
  assert.equal(getInventoryItems(valid.snapshot.orders, valid.snapshot.tradeEvents).some((entry) => entry.id === item.id), false);
});
