import assert from "node:assert/strict";
import test from "node:test";

import { catalogProducts } from "../data/products.ts";
import { createTopUpTransaction } from "./account.ts";
import { connectAuthAccount, createMockSteamUser } from "./auth.ts";
import { createEmptyAccountSnapshot, migrateMarketplaceState, persistMarketplaceState, readNewestValidMarketplaceState } from "./marketplace-state.ts";
import { prepareCheckoutTransaction } from "./marketplace-transaction.ts";

const tradeUrl = "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x";

function createReadyState() {
  const session = connectAuthAccount(null, createMockSteamUser());
  const snapshot = { ...createEmptyAccountSnapshot(), balanceCoins: 5_000, transactions: [createTopUpTransaction(5_000, 5_000, { id: "ready-top-up", createdAt: "2026-07-16T09:00:00.000Z" })], steamTradeUrl: tradeUrl };
  return migrateMarketplaceState({
    version: 5,
    revision: 4,
    cartIds: ["ak-redline"],
    session,
    accounts: { [session.steamAccount!.id]: snapshot },
    identityLinks: { [session.steamAccount!.id]: session },
  });
}

test("serialized checkout commits once against the latest revision and snapshots Trade URL", () => {
  const first = prepareCheckoutTransaction(createReadyState(), catalogProducts, {
    fulfillment: { steamLogin: "VaultPlayer", gptEmail: "linked-audit@example.com" },
    expectedRevision: 4,
    id: "order-transaction-test",
    transactionId: "transaction-test",
    number: "VLT-TRANSACTION-1",
    createdAt: "2026-07-17T09:00:00.000Z",
  });
  assert.equal(first.status, "success");
  if (first.status !== "success") return;
  assert.equal(first.state.revision, 5);
  assert.deepEqual(first.state.cartIds, []);
  assert.equal(first.snapshot.balanceCoins, 2_160);
  assert.deepEqual(first.records.order.recipient, { steamTradeUrl: tradeUrl });

  const duplicate = prepareCheckoutTransaction(first.state, catalogProducts, {
    fulfillment: { steamLogin: "VaultPlayer", gptEmail: "" },
    expectedRevision: 5,
  });
  assert.equal(duplicate.status, "empty");
  assert.equal(duplicate.state.revision, 5);
  assert.equal(duplicate.snapshot.balanceCoins, 2_160);
});

test("processing checkout state persists and reloads before external fulfillment", () => {
  const prepared = prepareCheckoutTransaction(createReadyState(), catalogProducts, {
    fulfillment: { steamLogin: "VaultPlayer", gptEmail: "" },
    expectedRevision: 4,
    id: "order-processing-persist",
    transactionId: "transaction-processing-persist",
    number: "VLT-PROCESSING-PERSIST",
    createdAt: "2026-07-17T09:05:00.000Z",
  });
  assert.equal(prepared.status, "success");
  if (prepared.status !== "success") return;
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(persistMarketplaceState(storage, "vault-state", prepared.state), true);
  const restored = readNewestValidMarketplaceState(storage, [{ key: "vault-state", version: 5 }]);
  assert.equal(restored?.accounts[prepared.state.currentAccountKey!]?.orders[0]?.status, "processing");
});

test("checkout rejects a stale expected revision before changing account data", () => {
  const state = createReadyState();
  const result = prepareCheckoutTransaction(state, catalogProducts, {
    fulfillment: { steamLogin: "VaultPlayer", gptEmail: "" },
    expectedRevision: 3,
  });
  assert.equal(result.status, "revision-conflict");
  assert.equal(result.state, state);
});

test("checkout rejects a reviewed cart or identity that changed before commit", () => {
  const state = createReadyState();
  const changed = { ...state, revision: 5, cartIds: ["awp-asiimov"] };
  const result = prepareCheckoutTransaction(changed, catalogProducts, {
    fulfillment: { steamLogin: "", gptEmail: "" },
    expectedRevision: 4,
  });
  assert.equal(result.status, "revision-conflict");
});

test("checkout validates recipients against the latest cart before deducting Coins", () => {
  const session = connectAuthAccount(null, createMockSteamUser());
  const snapshot = { ...createEmptyAccountSnapshot(), balanceCoins: 10_000, transactions: [createTopUpTransaction(10_000, 10_000, { id: "recipient-top-up", createdAt: "2026-07-16T09:00:00.000Z" })], steamTradeUrl: tradeUrl };
  const state = migrateMarketplaceState({
    version: 5,
    revision: 9,
    cartIds: ["gpt-plus", "steam-top-up-1000"],
    session,
    accounts: { [session.steamAccount!.id]: snapshot },
    identityLinks: { [session.steamAccount!.id]: session },
  });

  const result = prepareCheckoutTransaction(state, catalogProducts, {
    fulfillment: { steamLogin: "", gptEmail: "" },
    expectedRevision: 9,
  });

  assert.equal(result.status, "fulfillment-invalid");
  assert.equal(result.state.revision, 9);
  assert.equal(result.snapshot.balanceCoins, 10_000);
});
