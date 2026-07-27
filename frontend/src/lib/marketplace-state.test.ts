import assert from "node:assert/strict";
import test from "node:test";

import { demoOrders, demoTransactions } from "../data/account.ts";
import type { TradeEvent } from "../types/account.ts";
import { createMockEmailUser, createMockSteamUser, connectAuthAccount } from "./auth.ts";
import {
  buildIdentityLinks,
  createEmptyAccountSnapshot,
  createSeedSteamAccountSnapshot,
  getSessionAccountKey,
  getSessionAccountKeys,
  migrateMarketplaceState,
  persistMarketplaceState,
  restoreLinkedSession,
  resolveAccountConnection,
  createRevisionedMarketplaceState,
  mergeAccountSnapshots,
  parseMarketplaceStorageEvent,
  readNewestValidMarketplaceState,
  requestMarketplaceLock,
  createMarketplaceMutationOrigin,
  isMarketplaceMutationOriginCurrent,
  synchronizeLinkedAccountSnapshots,
  type AccountSnapshot,
  type PersistedMarketplaceState,
} from "./marketplace-state.ts";

test("stable account identity separates email accounts and preserves email identity when Steam is connected", () => {
  const first = connectAuthAccount(null, createMockEmailUser("first@example.com"));
  const firstWithSteam = connectAuthAccount(first, createMockSteamUser());
  const second = connectAuthAccount(null, createMockEmailUser("second@example.com"));

  assert.equal(getSessionAccountKey(first), "email:first@example.com");
  assert.equal(getSessionAccountKey(firstWithSteam), "email:first@example.com");
  assert.equal(getSessionAccountKey(second), "email:second@example.com");
});

test("new email account is empty while fixed Steam profile has isolated seed history", () => {
  const empty = createEmptyAccountSnapshot();
  const steam = createSeedSteamAccountSnapshot();
  assert.deepEqual(empty, { balanceCoins: 0, orders: [], transactions: [], tradeEvents: [], steamTradeUrl: "", isSeedData: false });
  assert.ok(steam.orders.length > 0);
  assert.ok(steam.transactions.length > 0);
  assert.notStrictEqual(steam.orders, demoOrders);
  assert.notStrictEqual(steam.transactions, demoTransactions);
});

test("v3 state migrates account data only into the authenticated identity and keeps cart global", () => {
  const session = connectAuthAccount(null, createMockEmailUser("first@example.com"));
  const migrated = migrateMarketplaceState({ version: 3, cartIds: ["ak-redline"], balanceCoins: 450, session, orders: demoOrders, transactions: demoTransactions, tradeEvents: [], steamTradeUrl: "" });
  assert.deepEqual(migrated.cartIds, ["ak-redline"]);
  assert.equal(migrated.currentAccountKey, "email:first@example.com");
  assert.equal(migrated.accounts["email:first@example.com"]?.balanceCoins, 450);

  const guest = migrateMarketplaceState({ version: 3, cartIds: ["ak-redline"], balanceCoins: 450, session: null, orders: demoOrders, transactions: demoTransactions });
  assert.deepEqual(guest.accounts, {});
});

test("linking Email to Steam or Steam to Email resolves to one shared snapshot", () => {
  const email = connectAuthAccount(null, createMockEmailUser("linked@example.com"));
  const steam = connectAuthAccount(null, createMockSteamUser());
  const bothFromEmail = connectAuthAccount(email, createMockSteamUser());
  const bothFromSteam = connectAuthAccount(steam, createMockEmailUser("linked@example.com"));
  const emailEmpty = createEmptyAccountSnapshot();
  const steamSeed = createSeedSteamAccountSnapshot();

  const emailFirst = synchronizeLinkedAccountSnapshots({
    accounts: {
      "email:linked@example.com": emailEmpty,
      "steam:7656119982144821": steamSeed,
    },
    currentSession: email,
    nextSession: bothFromEmail,
    currentSnapshot: emailEmpty,
  });
  const steamFirst = synchronizeLinkedAccountSnapshots({
    accounts: {
      "email:linked@example.com": emailEmpty,
      "steam:7656119982144821": steamSeed,
    },
    currentSession: steam,
    nextSession: bothFromSteam,
    currentSnapshot: steamSeed,
  });

  assert.deepEqual(getSessionAccountKeys(bothFromEmail), [
    "email:linked@example.com",
    "steam:7656119982144821",
  ]);
  assert.equal(emailFirst.snapshot.balanceCoins, steamSeed.balanceCoins);
  assert.deepEqual(emailFirst.accounts["email:linked@example.com"], emailFirst.accounts["steam:7656119982144821"]);
  assert.deepEqual(steamFirst.accounts["email:linked@example.com"], steamFirst.accounts["steam:7656119982144821"]);
});

test("linked aliases preserve the same account data after logout and either re-login", () => {
  const email = connectAuthAccount(null, createMockEmailUser("linked@example.com"));
  const both = connectAuthAccount(email, createMockSteamUser());
  const seed = createSeedSteamAccountSnapshot();
  const shared = {
    ...seed,
    steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=123456&token=Abc_def",
  };
  const linked = synchronizeLinkedAccountSnapshots({
    accounts: {},
    currentSession: email,
    nextSession: both,
    currentSnapshot: shared,
  });

  assert.equal(linked.accounts[getSessionAccountKey(email)!]?.balanceCoins, 12_500);
  assert.equal(linked.accounts[getSessionAccountKey(connectAuthAccount(null, createMockSteamUser()))!]?.balanceCoins, 12_500);
  assert.equal(linked.accounts["email:linked@example.com"]?.steamTradeUrl, shared.steamTradeUrl);
});

test("seed balance equals the latest completed ledger balance and is marked as local verification data", () => {
  const seed = createSeedSteamAccountSnapshot();
  const latestCompleted = [...seed.transactions]
    .filter((transaction) => transaction.status === "completed")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];

  assert.equal(seed.isSeedData, true);
  assert.ok(latestCompleted);
  assert.equal(seed.balanceCoins, latestCompleted.balanceAfterCoins);
});

test("linked identity metadata restores the complete session after either alias signs in again", () => {
  const emailAccount = createMockEmailUser("linked@example.com");
  const steamAccount = createMockSteamUser();
  const linkedSession = connectAuthAccount(connectAuthAccount(null, emailAccount), steamAccount);
  const identityLinks = buildIdentityLinks({}, linkedSession);

  assert.deepEqual(restoreLinkedSession(identityLinks, emailAccount), linkedSession);
  assert.deepEqual(restoreLinkedSession(identityLinks, steamAccount), linkedSession);
});

test("v4 migration preserves snapshots and safely derives only the authenticated linked session", () => {
  const emailAccount = createMockEmailUser("linked@example.com");
  const steamAccount = createMockSteamUser();
  const linkedSession = connectAuthAccount(connectAuthAccount(null, emailAccount), steamAccount);
  const snapshot = { ...createSeedSteamAccountSnapshot(), balanceCoins: 9876 };
  const migrated = migrateMarketplaceState({
    version: 4,
    cartIds: ["ak-redline"],
    session: linkedSession,
    currentAccountKey: emailAccount.id,
    accounts: { [emailAccount.id]: snapshot, [steamAccount.id]: snapshot },
  });

  assert.equal(migrated.version, 5);
  assert.equal(migrated.accounts[emailAccount.id]?.balanceCoins, 12_500);
  assert.deepEqual(restoreLinkedSession(migrated.identityLinks, emailAccount), linkedSession);
  assert.deepEqual(restoreLinkedSession(migrated.identityLinks, steamAccount), linkedSession);
});

test("v4 migration deterministically merges divergent linked aliases without losing records", () => {
  const emailAccount = createMockEmailUser("merge@example.com");
  const steamAccount = createMockSteamUser();
  const linkedSession = connectAuthAccount(connectAuthAccount(null, emailAccount), steamAccount);
  const emailOrder = { ...demoOrders[0], id: "email-order", number: "VLT-EMAIL" };
  const steamOrder = { ...demoOrders[1], id: "steam-order", number: "VLT-STEAM" };
  const emailTransaction = { ...demoTransactions[0], id: "email-transaction", balanceAfterCoins: 4_200, createdAt: "2026-07-12T08:00:00.000Z" };
  const steamTransaction = { ...demoTransactions[1], id: "steam-transaction", balanceAfterCoins: 7_300, createdAt: "2026-07-16T08:00:00.000Z" };
  const tradeUrl = "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x";
  const migrated = migrateMarketplaceState({
    version: 4,
    cartIds: [],
    session: linkedSession,
    currentAccountKey: emailAccount.id,
    accounts: {
      [emailAccount.id]: { ...createEmptyAccountSnapshot(), orders: [emailOrder], transactions: [emailTransaction] },
      [steamAccount.id]: {
        ...createEmptyAccountSnapshot(),
        balanceCoins: 7_300,
        orders: [steamOrder],
        transactions: [steamTransaction],
        tradeEvents: [{ id: "trade-1", createdAt: "2026-07-16T08:00:00.000Z", direction: "purchase", title: "AWP", status: "pending" }],
        steamTradeUrl: tradeUrl,
      },
    },
  });

  const emailSnapshot = migrated.accounts[emailAccount.id];
  const steamSnapshot = migrated.accounts[steamAccount.id];
  assert.deepEqual(emailSnapshot, steamSnapshot);
  assert.deepEqual(emailSnapshot.orders.map((order) => order.id).sort(), ["email-order", "steam-order"]);
  assert.deepEqual(emailSnapshot.transactions.filter((transaction) => transaction.reason === "purchase").map((transaction) => transaction.id).sort(), ["email-transaction", "steam-transaction"]);
  assert.equal(emailSnapshot.transactions.filter((transaction) => transaction.reason === "top-up").length, 1);
  assert.equal(emailSnapshot.tradeEvents[0]?.id, "trade-1");
  assert.equal(emailSnapshot.steamTradeUrl, tradeUrl);
  assert.equal(emailSnapshot.balanceCoins, 7_300);
});

test("identity graph never reassigns one Steam identity to another email", () => {
  const steam = createMockSteamUser();
  const emailA = createMockEmailUser("a@example.com");
  const emailB = createMockEmailUser("b@example.com");
  const linkedA = connectAuthAccount(connectAuthAccount(null, emailA), steam);
  const linkedB = connectAuthAccount(connectAuthAccount(null, emailB), steam);
  const links = buildIdentityLinks(buildIdentityLinks({}, linkedA), linkedB);

  assert.deepEqual(restoreLinkedSession(links, steam), linkedA);
  assert.deepEqual(restoreLinkedSession(links, emailA), linkedA);
  assert.deepEqual(restoreLinkedSession(links, emailB), connectAuthAccount(null, emailB));
});

test("persisted revisions are normalized and increase monotonically", () => {
  const initial = migrateMarketplaceState(null);
  const migrated = migrateMarketplaceState({ ...initial, revision: 7 });
  const damaged = migrateMarketplaceState({ ...initial, revision: -4 });

  assert.equal(initial.revision, 0);
  assert.equal(migrated.revision, 7);
  assert.equal(damaged.revision, 0);
});

test("A → Steam → logout → B → same Steam is rejected without leaking A", () => {
  const steam = createMockSteamUser();
  const emailA = createMockEmailUser("a@example.com");
  const emailB = createMockEmailUser("b@example.com");
  const linkedA = connectAuthAccount(connectAuthAccount(null, emailA), steam);
  const links = buildIdentityLinks({}, linkedA);
  const sessionB = connectAuthAccount(null, emailB);
  const result = resolveAccountConnection(links, sessionB, steam);

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /уже связан/);
  assert.deepEqual(restoreLinkedSession(links, steam), linkedA);
});

test("two previously used standalone identities can be linked in either direction", () => {
  const emailAccount = createMockEmailUser("standalone@example.com");
  const steamAccount = createMockSteamUser();
  const email = connectAuthAccount(null, emailAccount);
  const steam = connectAuthAccount(null, steamAccount);
  const links = buildIdentityLinks(buildIdentityLinks({}, email), steam);

  const emailFirst = resolveAccountConnection(links, email, steamAccount);
  const steamFirst = resolveAccountConnection(links, steam, emailAccount);

  assert.equal(emailFirst.ok, true);
  assert.equal(steamFirst.ok, true);
  if (emailFirst.ok && steamFirst.ok) {
    assert.deepEqual(getSessionAccountKeys(emailFirst.session).sort(), [emailAccount.id, steamAccount.id].sort());
    assert.deepEqual(getSessionAccountKeys(steamFirst.session).sort(), [emailAccount.id, steamAccount.id].sort());
  }
});

test("linking populated standalone identities merges their records direction-independently", () => {
  const emailAccount = createMockEmailUser("merge-standalone@example.com");
  const steamAccount = createMockSteamUser();
  const email = connectAuthAccount(null, emailAccount);
  const steam = connectAuthAccount(null, steamAccount);
  const emailOrder = { ...demoOrders[0], id: "email-standalone-order" };
  const steamOrder = { ...demoOrders[1], id: "steam-standalone-order" };
  const emailSnapshot = {
    ...createEmptyAccountSnapshot(),
    balanceCoins: 4_000,
    orders: [emailOrder],
    transactions: [{ ...demoTransactions.at(-2)!, id: "email-ledger", amountCoins: 4_000, balanceAfterCoins: 4_000, createdAt: "2026-07-10T08:00:00.000Z" }],
  };
  const steamSnapshot = {
    ...createEmptyAccountSnapshot(),
    balanceCoins: 7_500,
    orders: [steamOrder],
    transactions: [
      { ...demoTransactions[1], id: "steam-ledger", amountCoins: steamOrder.totalCoins, balanceAfterCoins: 7_500, createdAt: "2026-07-16T08:00:00.000Z", orderNumber: steamOrder.number },
      { ...demoTransactions.at(-2)!, id: "steam-top-up", amountCoins: 7_500 + steamOrder.totalCoins, balanceAfterCoins: 7_500 + steamOrder.totalCoins, createdAt: "2026-07-11T08:00:00.000Z" },
    ],
    tradeEvents: [{ id: "standalone-trade", createdAt: "2026-07-16T08:00:00.000Z", direction: "purchase" as const, title: steamOrder.items[0].title, orderNumber: steamOrder.number, status: "pending" as const }],
    steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbC_12-x",
  };
  const accounts = { [emailAccount.id]: emailSnapshot, [steamAccount.id]: steamSnapshot };
  const emailFirst = synchronizeLinkedAccountSnapshots({ accounts, currentSession: email, nextSession: connectAuthAccount(email, steamAccount), currentSnapshot: emailSnapshot });
  const steamFirst = synchronizeLinkedAccountSnapshots({ accounts, currentSession: steam, nextSession: connectAuthAccount(steam, emailAccount), currentSnapshot: steamSnapshot });

  assert.deepEqual(emailFirst.snapshot, steamFirst.snapshot);
  assert.deepEqual(emailFirst.snapshot.orders.map((order) => order.id).sort(), ["email-standalone-order", "steam-standalone-order"]);
  assert.deepEqual(emailFirst.snapshot.transactions.map((transaction) => transaction.id).sort(), ["email-ledger", "steam-ledger", "steam-top-up"]);
  assert.equal(emailFirst.snapshot.tradeEvents[0]?.id, "standalone-trade");
  assert.equal(emailFirst.snapshot.balanceCoins, 11_500);
  assert.equal(emailFirst.accounts[emailAccount.id], emailFirst.accounts[steamAccount.id]);
});

test("hydration skips corrupt or structurally invalid v5 and preserves the newest valid backup", () => {
  const email = connectAuthAccount(null, createMockEmailUser("fallback@example.com"));
  const validV4 = { version: 4, revision: 8, cartIds: ["ak-redline"], session: email, accounts: { [email.emailAccount!.id]: { ...createEmptyAccountSnapshot(), balanceCoins: 800 } } };
  const validV3 = { version: 3, revision: 6, cartIds: ["awp-asiimov"], session: email, balanceCoins: 600, orders: [], transactions: [], tradeEvents: [], steamTradeUrl: "" };
  const values = new Map<string, string>([
    ["v5", JSON.stringify({ version: 5, revision: "broken", cartIds: {}, session: null, accounts: [], identityLinks: {} })],
    ["v4", JSON.stringify(validV4)],
    ["v3", JSON.stringify(validV3)],
  ]);
  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [
    { key: "v5", version: 5 },
    { key: "v4", version: 4 },
    { key: "v3", version: 3 },
  ]);

  assert.equal(selected?.revision, 8);
  assert.deepEqual(selected?.cartIds, ["ak-redline"]);
  assert.equal(values.has("v4"), true);
  assert.equal(values.has("v3"), true);
});

test("hydration rejects a v5 snapshot with corrupt nested records and falls back to valid v4", () => {
  const email = connectAuthAccount(null, createMockEmailUser("nested-fallback@example.com"));
  const validSnapshot = { ...createEmptyAccountSnapshot(), balanceCoins: 640 };
  const corruptSnapshot = {
    ...validSnapshot,
    balanceCoins: 999,
    orders: [{ id: "partial-order" }],
    transactions: [{ id: "partial-transaction" }],
    tradeEvents: [{ id: "partial-trade" }],
  };
  const values = new Map<string, string>([
    ["v5", JSON.stringify({
      version: 5,
      revision: 9,
      cartIds: ["ak-redline"],
      session: email,
      currentAccountKey: email.emailAccount!.id,
      accounts: { [email.emailAccount!.id]: corruptSnapshot },
      identityLinks: { [email.emailAccount!.id]: email },
    })],
    ["v4", JSON.stringify({
      version: 4,
      revision: 8,
      cartIds: ["awp-asiimov"],
      session: email,
      currentAccountKey: email.emailAccount!.id,
      accounts: { [email.emailAccount!.id]: validSnapshot },
    })],
  ]);

  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [
    { key: "v5", version: 5 },
    { key: "v4", version: 4 },
  ]);

  assert.equal(selected?.revision, 8);
  assert.deepEqual(selected?.cartIds, ["awp-asiimov"]);
  assert.equal(selected?.accounts[email.emailAccount!.id]?.balanceCoins, 640);
});

test("hydration rejects invalid TradeEvent dates and non-string order numbers", () => {
  const email = connectAuthAccount(null, createMockEmailUser("trade-fallback@example.com"));
  const validSnapshot = createEmptyAccountSnapshot();
  const values = new Map<string, string>([
    ["v5", JSON.stringify({
      version: 5, revision: 10, cartIds: [], session: email,
      currentAccountKey: email.emailAccount!.id,
      accounts: { [email.emailAccount!.id]: { ...validSnapshot, tradeEvents: [{ id: "bad", createdAt: "not-a-date", direction: "purchase", title: "AWP", orderNumber: { nested: true }, status: "pending" }] } },
      identityLinks: { [email.emailAccount!.id]: email },
    })],
    ["v4", JSON.stringify({ version: 4, revision: 9, cartIds: ["awp-asiimov"], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: validSnapshot } })],
  ]);
  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }, { key: "v4", version: 4 }]);
  assert.equal(selected?.revision, 9);
});

test("hydration rejects mismatched account identities and provider prefixes", () => {
  const email = connectAuthAccount(null, createMockEmailUser("owner@example.com"));
  const forged = { ...email, emailAccount: { ...email.emailAccount!, id: "email:victim@example.com" } };
  const backup = { version: 4, revision: 6, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: createEmptyAccountSnapshot() } };
  const values = new Map<string, string>([
    ["v5", JSON.stringify({ version: 5, revision: 7, cartIds: [], session: forged, currentAccountKey: "email:victim@example.com", accounts: { "email:victim@example.com": createEmptyAccountSnapshot() }, identityLinks: { "email:victim@example.com": forged } })],
    ["v4", JSON.stringify(backup)],
  ]);
  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }, { key: "v4", version: 4 }]);
  assert.equal(selected?.revision, 6);
  assert.equal(selected?.currentAccountKey, "email:owner@example.com");
});

test("hydration rejects cross-record ledger and order inconsistencies", () => {
  const email = connectAuthAccount(null, createMockEmailUser("ledger@example.com"));
  const order = { ...demoOrders[0], id: "ledger-order", number: "VLT-LEDGER", totalCoins: demoOrders[0].totalCoins + 1 };
  const transaction = { ...demoTransactions[0], id: "ledger-transaction", reason: "purchase" as const, direction: "debit" as const, status: "completed" as const, orderNumber: "VLT-MISSING", balanceAfterCoins: 999 };
  const corrupt = { ...createEmptyAccountSnapshot(), balanceCoins: 123, orders: [order], transactions: [transaction] };
  const backup = { ...createEmptyAccountSnapshot(), balanceCoins: 640 };
  const values = new Map<string, string>([
    ["v5", JSON.stringify({ version: 5, revision: 12, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: corrupt }, identityLinks: { [email.emailAccount!.id]: email } })],
    ["v4", JSON.stringify({ version: 4, revision: 11, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: backup } })],
  ]);
  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }, { key: "v4", version: 4 }]);
  assert.equal(selected?.revision, 11);
  assert.equal(selected?.accounts[email.emailAccount!.id]?.balanceCoins, 640);
});

test("hydration rejects a failed duplicate purchase linked to an already charged order", () => {
  const email = connectAuthAccount(null, createMockEmailUser("failed-duplicate@example.com"));
  const seed = createSeedSteamAccountSnapshot();
  const chargedOrder = seed.orders.find((order) => order.status === "completed");
  assert.ok(chargedOrder);
  const chargedTransaction = seed.transactions.find((transaction) => (
    transaction.reason === "purchase" && transaction.orderNumber === chargedOrder.number
  ));
  assert.ok(chargedTransaction);
  const failedDuplicate = {
    ...chargedTransaction,
    id: "failed-duplicate-purchase",
    createdAt: "2026-07-17T09:00:00.000Z",
    status: "failed" as const,
    description: "Неуспешная повторная покупка",
    balanceAfterCoins: seed.balanceCoins,
  };
  const corruptSnapshot = {
    ...seed,
    transactions: [failedDuplicate, ...seed.transactions],
  };
  const backup = { version: 4, revision: 14, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: createEmptyAccountSnapshot() } };
  const values = new Map<string, string>([
    ["v5", JSON.stringify({
      version: 5,
      revision: 15,
      cartIds: [],
      session: email,
      currentAccountKey: email.emailAccount!.id,
      accounts: { [email.emailAccount!.id]: corruptSnapshot },
      identityLinks: { [email.emailAccount!.id]: email },
    })],
    ["v4", JSON.stringify(backup)],
  ]);

  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [
    { key: "v5", version: 5 },
    { key: "v4", version: 4 },
  ]);

  assert.equal(selected?.revision, 14);
  assert.equal(selected?.accounts[email.emailAccount!.id]?.transactions.length, 0);
});

test("same-provider account replacement is rejected and cannot merge unrelated snapshots", () => {
  const emailA = createMockEmailUser("replace-a@example.com");
  const emailB = createMockEmailUser("replace-b@example.com");
  const current = connectAuthAccount(null, emailA);
  const replacement = connectAuthAccount(null, emailB);
  const result = resolveAccountConnection({}, current, emailB);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /выйдите/i);

  const snapshotA = { ...createEmptyAccountSnapshot(), balanceCoins: 1_200 };
  const snapshotB = { ...createEmptyAccountSnapshot(), balanceCoins: 7_700 };
  const synchronized = synchronizeLinkedAccountSnapshots({
    accounts: { [emailA.id]: snapshotA, [emailB.id]: snapshotB },
    currentSession: current,
    nextSession: replacement,
    currentSnapshot: snapshotA,
  });
  assert.equal(synchronized.accounts[emailA.id]?.balanceCoins, 1_200);
  assert.equal(synchronized.accounts[emailB.id]?.balanceCoins, 7_700);
  assert.equal(synchronized.snapshot.balanceCoins, 7_700);

  const steamA = createMockSteamUser();
  const steamB = { ...steamA, id: "steam:222", steamId: "222", displayName: "Second Steam" };
  const steamReplacement = resolveAccountConnection({}, connectAuthAccount(null, steamA), steamB);
  assert.equal(steamReplacement.ok, false);
  if (!steamReplacement.ok) assert.match(steamReplacement.message, /выйдите/i);
});

test("conflicting duplicate records are rejected regardless of snapshot order", () => {
  const first = {
    ...createEmptyAccountSnapshot(),
    transactions: [{ ...demoTransactions[0], id: "duplicate-ledger", createdAt: "2026-07-17T08:00:00.000Z", balanceAfterCoins: 1_000 }],
  };
  const second = {
    ...createEmptyAccountSnapshot(),
    transactions: [{ ...demoTransactions[0], id: "duplicate-ledger", createdAt: "2026-07-17T08:00:00.000Z", balanceAfterCoins: 9_000 }],
  };

  assert.throws(() => mergeAccountSnapshots([first, second]), /conflict/i);
  assert.throws(() => mergeAccountSnapshots([second, first]), /conflict/i);
});

test("a valid v5 wins hydration even when a backup has a larger revision", () => {
  const base = migrateMarketplaceState({ version: 5, revision: 2, cartIds: ["ak-redline"], session: null, accounts: {}, identityLinks: {} });
  const backup = { version: 4, revision: 20, cartIds: ["awp-asiimov"], session: null, accounts: {} };
  const values = new Map([["v5", JSON.stringify(base)], ["v4", JSON.stringify(backup)]]);
  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [
    { key: "v5", version: 5 },
    { key: "v4", version: 4 },
  ]);
  assert.equal(selected?.revision, 2);
  assert.deepEqual(selected?.cartIds, ["ak-redline"]);
});

test("mutation origins reject a changed session or revision inside the lock", () => {
  const stateA = migrateMarketplaceState({ version: 5, revision: 3, cartIds: [], session: connectAuthAccount(null, createMockEmailUser("a@example.com")), accounts: {}, identityLinks: {} });
  const origin = createMarketplaceMutationOrigin(stateA);
  const stateB = migrateMarketplaceState({ ...stateA, revision: 4, session: connectAuthAccount(null, createMockEmailUser("b@example.com")) });
  assert.equal(isMarketplaceMutationOriginCurrent(stateA, origin), true);
  assert.equal(isMarketplaceMutationOriginCurrent({ ...stateA, revision: 4 }, origin), false);
  assert.equal(isMarketplaceMutationOriginCurrent(stateB, origin), false);
});

test("storage events apply only a newer valid revision for the marketplace key", () => {
  const base = migrateMarketplaceState(null);
  const newer = createRevisionedMarketplaceState(base, { cartIds: ["ak-redline"] });
  const event = { key: "vault-marketplace-state-v5", newValue: JSON.stringify(newer) };

  assert.equal(parseMarketplaceStorageEvent("vault-marketplace-state-v5", event, 0)?.revision, 1);
  assert.equal(parseMarketplaceStorageEvent("vault-marketplace-state-v5", event, 1), null);
  assert.equal(parseMarketplaceStorageEvent("another-key", event, 0), null);
  assert.equal(parseMarketplaceStorageEvent("vault-marketplace-state-v5", { ...event, newValue: "broken" }, 0), null);
});

test("marketplace lock serializes concurrent tasks through Web Locks", async () => {
  let chain = Promise.resolve();
  const locks = {
    request<T>(_name: string, callback: () => Promise<T> | T) {
      const result = chain.then(callback);
      chain = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const order: string[] = [];
  await Promise.all([
    requestMarketplaceLock({ locks, storage, lockName: "checkout" }, async () => {
      order.push("first:start");
      await Promise.resolve();
      order.push("first:end");
    }),
    requestMarketplaceLock({ locks, storage, lockName: "checkout" }, () => {
      order.push("second");
    }),
  ]);
  assert.deepEqual(order, ["first:start", "first:end", "second"]);
});

test("mutations fail closed when Web Locks are unavailable", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let entered = false;
  await assert.rejects(
    requestMarketplaceLock({ storage, lockName: "fallback" }, () => { entered = true; }),
    /marketplace-lock-unavailable/,
  );
  assert.equal(entered, false);
  assert.equal(values.size, 0);
});

test("failed marketplace persistence is reported synchronously without claiming a commit", () => {
  const state = migrateMarketplaceState(null);
  let attempts = 0;
  const storage = {
    setItem() {
      attempts += 1;
      throw new Error("quota exceeded");
    },
  };

  assert.equal(persistMarketplaceState(storage, "vault-state", state), false);
  assert.equal(attempts, 1);
});

test("v5 ledger starts at zero and rejects balances without completed ledger history", () => {
  const email = connectAuthAccount(null, createMockEmailUser("semantic@example.com"));
  const invalidSnapshots = [
    { ...createEmptyAccountSnapshot(), balanceCoins: 100 },
    {
      ...createEmptyAccountSnapshot(),
      balanceCoins: 100,
      transactions: [{ ...demoTransactions[0], id: "failed-credit", reason: "top-up" as const, direction: "credit" as const, status: "failed" as const, amountCoins: 100, balanceAfterCoins: 100, orderNumber: undefined }],
    },
  ];
  for (const [index, snapshot] of invalidSnapshots.entries()) {
    const state = { version: 5, revision: index, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: snapshot }, identityLinks: { [email.emailAccount!.id]: email } };
    const values = new Map([["v5", JSON.stringify(state)]]);
    assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
  }
});

test("v5 requires exact order debits, zero-based continuity, safe integers and unique record ids", () => {
  const email = connectAuthAccount(null, createMockEmailUser("strict-ledger@example.com"));
  const order = { ...demoOrders[0], id: "strict-order", number: "VLT-STRICT", status: "completed" as const };
  const topUp = { ...demoTransactions.at(-2)!, id: "strict-top-up", createdAt: "2026-07-01T00:00:00.000Z", amountCoins: 10_000, balanceAfterCoins: 10_000 };
  const debit = { ...demoTransactions[0], id: "strict-debit", createdAt: "2026-07-02T00:00:00.000Z", reason: "purchase" as const, direction: "debit" as const, orderNumber: order.number, amountCoins: order.totalCoins, balanceAfterCoins: 10_000 - order.totalCoins };
  const valid = { ...createEmptyAccountSnapshot(), balanceCoins: debit.balanceAfterCoins, orders: [order], transactions: [debit, topUp] };
  const variants = [
    { ...valid, transactions: [debit, topUp, { ...debit, id: "extra-debit" }] },
    { ...valid, transactions: [{ ...debit, amountCoins: order.totalCoins + 1 }, topUp] },
    { ...valid, transactions: [{ ...debit, balanceAfterCoins: debit.balanceAfterCoins + 1 }, topUp] },
    { ...valid, orders: [{ ...order, totalCoins: 1.5, items: [{ ...order.items[0], priceCoins: 1.5 }] }] },
    { ...valid, transactions: [{ ...debit, id: topUp.id }, topUp] },
  ];
  for (const snapshot of variants) {
    const state = { version: 5, revision: 1, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: snapshot }, identityLinks: { [email.emailAccount!.id]: email } };
    const values = new Map([["v5", JSON.stringify(state)]]);
    assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
  }
});

test("link merge sums independent valid ledgers and roundtrips without drift", () => {
  const emailAccount = createMockEmailUser("sum@example.com");
  const steamAccount = createMockSteamUser();
  const email = connectAuthAccount(null, emailAccount);
  const linked = connectAuthAccount(email, steamAccount);
  const first = { ...createEmptyAccountSnapshot(), balanceCoins: 100, transactions: [{ ...demoTransactions.at(-2)!, id: "credit-a", createdAt: "2026-07-01T00:00:00.000Z", amountCoins: 100, balanceAfterCoins: 100 }] };
  const second = { ...createEmptyAccountSnapshot(), balanceCoins: 200, transactions: [{ ...demoTransactions.at(-2)!, id: "credit-b", createdAt: "2026-07-02T00:00:00.000Z", amountCoins: 200, balanceAfterCoins: 200 }] };
  const result = synchronizeLinkedAccountSnapshots({ accounts: { [emailAccount.id]: first, [steamAccount.id]: second }, currentSession: email, nextSession: linked, currentSnapshot: first });
  assert.equal(result.snapshot.balanceCoins, 300);
  assert.deepEqual(result.snapshot.transactions.map((entry) => entry.balanceAfterCoins).sort((a, b) => a - b), [100, 300]);
  const state = { version: 5 as const, revision: 1, cartIds: [], session: linked, currentAccountKey: emailAccount.id, accounts: result.accounts, identityLinks: buildIdentityLinks({}, linked) };
  const values = new Map([["v5", JSON.stringify(state)]]);
  const hydrated = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]);
  assert.deepEqual(hydrated, state);
});

test("link merge rejects conflicting duplicate ids instead of choosing a record", () => {
  const first = { ...createEmptyAccountSnapshot(), balanceCoins: 100, transactions: [{ ...demoTransactions.at(-2)!, id: "same", amountCoins: 100, balanceAfterCoins: 100 }] };
  const second = { ...createEmptyAccountSnapshot(), balanceCoins: 200, transactions: [{ ...demoTransactions.at(-2)!, id: "same", amountCoins: 200, balanceAfterCoins: 200 }] };
  assert.throws(() => mergeAccountSnapshots([first, second]), /conflict/i);
});

test("revision must remain safely incrementable", () => {
  const state = migrateMarketplaceState(null);
  assert.throws(() => createRevisionedMarketplaceState({ ...state, revision: Number.MAX_SAFE_INTEGER - 1 }, {}), /revision/i);
  assert.throws(() => createRevisionedMarketplaceState({ ...state, revision: Number.MAX_SAFE_INTEGER - 2 }, {}), /revision/i);
  const values = new Map([["v5", JSON.stringify({ ...state, revision: Number.MAX_SAFE_INTEGER })]]);
  assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
});

test("fresh Email and Steam sessions create persistable identity snapshots", () => {
  for (const account of [createMockEmailUser("fresh@example.com"), createMockSteamUser()]) {
    const session = connectAuthAccount(null, account);
    const linked = synchronizeLinkedAccountSnapshots({
      accounts: {},
      currentSession: null,
      nextSession: session,
      currentSnapshot: createEmptyAccountSnapshot(),
    });
    const state = {
      version: 5 as const,
      revision: 1,
      cartIds: [],
      session,
      currentAccountKey: account.id,
      accounts: linked.accounts,
      identityLinks: buildIdentityLinks({}, session),
    };
    assert.ok(linked.accounts[account.id]);
    const values = new Map([["v5", JSON.stringify(state)]]);
    assert.deepEqual(
      readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]),
      state,
    );
  }
});

test("processing and completed charged orders require exactly one matching completed debit", () => {
  const email = connectAuthAccount(null, createMockEmailUser("charged@example.com"));
  for (const status of ["processing", "completed"] as const) {
    const order = { ...demoOrders[0], id: `charged-${status}`, number: `VLT-${status.toUpperCase()}`, status };
    const credit = { ...demoTransactions.at(-2)!, id: `credit-${status}`, createdAt: "2026-07-01T00:00:00.000Z", amountCoins: 10_000, balanceAfterCoins: 10_000, orderNumber: undefined };
    const debit = { ...demoTransactions[0], id: `debit-${status}`, createdAt: "2026-07-02T00:00:00.000Z", reason: "purchase" as const, direction: "debit" as const, status: "completed" as const, orderNumber: order.number, amountCoins: order.totalCoins, balanceAfterCoins: 10_000 - order.totalCoins };
    const base = { ...createEmptyAccountSnapshot(), balanceCoins: debit.balanceAfterCoins, orders: [order], transactions: [debit, credit] };
    const variants = [
      { ...base, balanceCoins: 10_000, transactions: [credit] },
      { ...base, transactions: [debit, { ...debit, id: `${debit.id}-two` }, credit] },
    ];
    for (const snapshot of variants) {
      const state = { version: 5, revision: 1, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: snapshot }, identityLinks: { [email.emailAccount!.id]: email } };
      const values = new Map([["v5", JSON.stringify(state)]]);
      assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
    }
  }
});

test("legacy balance-only snapshots migrate to a strict deterministic opening ledger and roundtrip", () => {
  const email = connectAuthAccount(null, createMockEmailUser("legacy@example.com"));
  for (const version of [3, 4] as const) {
    const legacy = version === 3
      ? { version, revision: 3, cartIds: [], session: email, balanceCoins: 640, orders: [], transactions: [], tradeEvents: [], steamTradeUrl: "" }
      : { version, revision: 4, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: { ...createEmptyAccountSnapshot(), balanceCoins: 640 } } };
    const values = new Map([[`v${version}`, JSON.stringify(legacy)]]);
    const migrated = readNewestValidMarketplaceState(
      { getItem: (key: string) => values.get(key) ?? null },
      [{ key: `v${version}`, version }],
    );
    assert.equal(migrated?.accounts[email.emailAccount!.id]?.balanceCoins, 640);
    assert.equal(migrated?.accounts[email.emailAccount!.id]?.transactions.length, 1);
    assert.equal(migrated?.accounts[email.emailAccount!.id]?.transactions[0]?.reason, "top-up");
    const roundtrip = new Map([["v5", JSON.stringify(migrated)]]);
    assert.deepEqual(readNewestValidMarketplaceState({ getItem: (key: string) => roundtrip.get(key) ?? null }, [{ key: "v5", version: 5 }]), migrated);
  }

  const unsafe = new Map([["v3", JSON.stringify({ version: 3, revision: 2, cartIds: [], session: email, balanceCoins: 1.5, orders: [], transactions: [] })]]);
  assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => unsafe.get(key) ?? null }, [{ key: "v3", version: 3 }]), null);
});

test("strict snapshots reject blank or colliding identifiers and orphan purchase trades", () => {
  const email = connectAuthAccount(null, createMockEmailUser("ids@example.com"));
  const order = { ...demoOrders[0], id: "order-id", number: "VLT-IDS", status: "completed" as const };
  const credit = { ...demoTransactions.at(-2)!, id: "credit-id", createdAt: "2026-07-01T00:00:00.000Z", amountCoins: 10_000, balanceAfterCoins: 10_000, orderNumber: undefined };
  const debit = { ...demoTransactions[0], id: "debit-id", createdAt: "2026-07-02T00:00:00.000Z", reason: "purchase" as const, direction: "debit" as const, status: "completed" as const, orderNumber: order.number, amountCoins: order.totalCoins, balanceAfterCoins: 10_000 - order.totalCoins };
  const valid = { ...createEmptyAccountSnapshot(), balanceCoins: debit.balanceAfterCoins, orders: [order], transactions: [debit, credit] };
  const variants = [
    { ...valid, orders: [{ ...order, id: "" }] },
    { ...valid, orders: [{ ...order, number: "" }] },
    { ...valid, orders: [{ ...order, items: order.items.map((item) => ({ ...item, id: "" })) }] },
    { ...valid, transactions: [{ ...debit, id: order.id }, credit] },
    { ...valid, tradeEvents: [{ id: "orphan-trade", createdAt: debit.createdAt, direction: "purchase" as const, title: order.items[0].title, orderNumber: "VLT-MISSING", status: "processing" as const }] },
    { ...valid, tradeEvents: [{ id: "blank-order-trade", createdAt: debit.createdAt, direction: "purchase" as const, title: order.items[0].title, status: "processing" as const }] },
  ];
  for (const snapshot of variants) {
    const state = { version: 5, revision: 1, cartIds: [], session: email, currentAccountKey: email.emailAccount!.id, accounts: { [email.emailAccount!.id]: snapshot }, identityLinks: { [email.emailAccount!.id]: email } };
    const values = new Map([["v5", JSON.stringify(state)]]);
    assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
  }
});

test("v5 rejects divergent snapshots and conflicting provider ownership across linked aliases", () => {
  const email = createMockEmailUser("linked-integrity@example.com");
  const steam = createMockSteamUser();
  const linked = connectAuthAccount(connectAuthAccount(null, email), steam);
  const credit = { ...demoTransactions.at(-2)!, id: "linked-credit", amountCoins: 100, balanceAfterCoins: 100 };
  const first = { ...createEmptyAccountSnapshot(), balanceCoins: 100, transactions: [credit] };
  const second = { ...createEmptyAccountSnapshot(), balanceCoins: 900, transactions: [{ ...credit, id: "inflated-credit", amountCoins: 900, balanceAfterCoins: 900 }] };
  const backup = { version: 4, revision: 7, cartIds: [], session: connectAuthAccount(null, email), currentAccountKey: email.id, accounts: { [email.id]: { ...createEmptyAccountSnapshot(), balanceCoins: 40 } } };
  const divergent = { version: 5, revision: 8, cartIds: [], session: linked, currentAccountKey: email.id, accounts: { [email.id]: first, [steam.id]: second }, identityLinks: { [email.id]: linked, [steam.id]: linked } };
  const values = new Map([["v5", JSON.stringify(divergent)], ["v4", JSON.stringify(backup)]]);
  const selected = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }, { key: "v4", version: 4 }]);
  assert.equal(selected?.revision, 7);

  const otherEmail = createMockEmailUser("other-owner@example.com");
  const reassigned = connectAuthAccount(connectAuthAccount(null, otherEmail), steam);
  values.set("v5", JSON.stringify({ ...divergent, identityLinks: { [email.id]: linked, [steam.id]: reassigned } }));
  const ownershipFallback = readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }, { key: "v4", version: 4 }]);
  assert.equal(ownershipFallback?.revision, 7);
});

test("v5 rejects contradictory order delivery, fulfillment and recipient semantics", () => {
  const email = createMockEmailUser("semantic-order@example.com");
  const steam = createMockSteamUser();
  const linked = connectAuthAccount(connectAuthAccount(null, email), steam);
  const order = { ...demoOrders[1], id: "semantic-skin-order", number: "VLT-SEMANTIC", status: "completed" as const, isDemo: false, recipient: { steamTradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEf12" } };
  const credit = { ...demoTransactions.at(-2)!, id: "semantic-credit", createdAt: "2026-07-01T00:00:00.000Z", amountCoins: 10_000, balanceAfterCoins: 10_000 };
  const debit = { ...demoTransactions[0], id: "semantic-debit", createdAt: "2026-07-02T00:00:00.000Z", orderNumber: order.number, amountCoins: order.totalCoins, balanceAfterCoins: 10_000 - order.totalCoins };
  const trade = { id: "semantic-trade", createdAt: "2026-07-02T00:00:00.000Z", direction: "purchase" as const, title: order.items[0].title, orderNumber: order.number, status: "completed" as const };
  const base = { ...createEmptyAccountSnapshot(), balanceCoins: debit.balanceAfterCoins, orders: [order], transactions: [debit, credit], tradeEvents: [trade] };
  const invalid = [
    { ...base, orders: [{ ...order, items: order.items.map((item) => ({ ...item, deliveryStatus: "pending" as const })) }] },
    { ...base, orders: [{ ...order, items: order.items.map((item) => ({ ...item, fulfillmentMode: "automatic" as const })) }] },
    { ...base, orders: [{ ...order, recipient: undefined }] },
    { ...base, tradeEvents: [] },
  ];
  for (const snapshot of invalid) {
    const state = { version: 5, revision: 4, cartIds: [], session: linked, currentAccountKey: email.id, accounts: { [email.id]: snapshot, [steam.id]: snapshot }, identityLinks: { [email.id]: linked, [steam.id]: linked } };
    const values = new Map([["v5", JSON.stringify(state)]]);
    assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
  }
});

test("successful local skin orders cannot bypass recipient and trade closure", () => {
  const email = createMockEmailUser("local-closure@example.com");
  const steam = createMockSteamUser();
  const linked = connectAuthAccount(connectAuthAccount(null, email), steam);
  const seed = createSeedSteamAccountSnapshot();
  const successfulSkin = seed.orders.find((order) => order.status === "completed" && order.items.some((item) => item.kind === "skins"));
  assert.ok(successfulSkin);
  const invalidSnapshots = [
    { ...seed, orders: seed.orders.map((order) => order.id === successfulSkin.id ? { ...order, recipient: undefined } : order) },
    { ...seed, tradeEvents: seed.tradeEvents.filter((event) => event.orderNumber !== successfulSkin.number) },
  ];
  for (const snapshot of invalidSnapshots) {
    const state = { version: 5, revision: 20, cartIds: [], session: linked, currentAccountKey: email.id, accounts: { [email.id]: snapshot, [steam.id]: snapshot }, identityLinks: { [email.id]: linked, [steam.id]: linked } };
    const values = new Map([["v5", JSON.stringify(state)]]);
    assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
  }
});

test("skin trades are linked one-to-one by immutable item id and lifecycle", () => {
  const email = createMockEmailUser("item-link@example.com");
  const steam = createMockSteamUser();
  const linked = connectAuthAccount(connectAuthAccount(null, email), steam);
  const seed = createSeedSteamAccountSnapshot();
  const source = seed.orders.find((order) => order.status === "completed" && order.items.some((item) => item.kind === "skins"));
  assert.ok(source);
  const first = source.items.find((item) => item.kind === "skins")!;
  const second = { ...first, id: `${first.id}-second`, productId: `${first.productId}-second` };
  const order = { ...source, id: "same-title-order", number: "VLT-SAME-TITLE", items: [first, second], totalCoins: first.priceCoins + second.priceCoins };
  const credit = { ...demoTransactions.at(-2)!, id: "same-title-credit", createdAt: "2026-07-01T00:00:00.000Z", amountCoins: 20_000, balanceAfterCoins: 20_000 };
  const debit = { ...demoTransactions[0], id: "same-title-debit", createdAt: "2026-07-02T00:00:00.000Z", orderNumber: order.number, amountCoins: order.totalCoins, balanceAfterCoins: 20_000 - order.totalCoins };
  const oneTrade = { id: "same-title-trade", itemId: first.id, createdAt: debit.createdAt, direction: "purchase" as const, title: first.title, orderNumber: order.number, status: "completed" as const };
  const snapshot = { ...createEmptyAccountSnapshot(), balanceCoins: debit.balanceAfterCoins, orders: [order], transactions: [debit, credit], tradeEvents: [oneTrade] };
  const state = { version: 5, revision: 21, cartIds: [], session: linked, currentAccountKey: email.id, accounts: { [email.id]: snapshot, [steam.id]: snapshot }, identityLinks: { [email.id]: linked, [steam.id]: linked } };
  const values = new Map([["v5", JSON.stringify(state)]]);
  assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);

  const cancelled = { ...snapshot, orders: [{ ...order, status: "cancelled" as const, items: order.items.map((item) => ({ ...item, deliveryStatus: "pending" as const })) }] };
  values.set("v5", JSON.stringify({ ...state, accounts: { [email.id]: cancelled, [steam.id]: cancelled } }));
  assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
});

test("persisted v5 rejects forged sale and withdrawal trade events", () => {
  const email = createMockEmailUser("forged-trade@example.com");
  const steam = createMockSteamUser();
  const linked = connectAuthAccount(connectAuthAccount(null, email), steam);
  const seed = createSeedSteamAccountSnapshot();
  const purchase = seed.tradeEvents.find((event) => event.direction === "purchase");
  assert.ok(purchase);

  for (const direction of ["sale", "withdrawal"] as const) {
    const forged: TradeEvent = {
      ...purchase,
      id: `forged-${direction}`,
      direction,
    };
    const snapshot: AccountSnapshot = { ...seed, tradeEvents: [forged, ...seed.tradeEvents] };
    const state: PersistedMarketplaceState = {
      version: 5,
      revision: 30,
      cartIds: [],
      session: linked,
      currentAccountKey: email.id,
      accounts: { [email.id]: snapshot, [steam.id]: snapshot },
      identityLinks: { [email.id]: linked, [steam.id]: linked },
    };
    const values = new Map<string, string>([["v5", JSON.stringify(state)]]);
    assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
  }
});

test("persisted v5 rejects an order dated after its debit or purchase trade", () => {
  const email = createMockEmailUser("future-order@example.com");
  const steam = createMockSteamUser();
  const linked = connectAuthAccount(connectAuthAccount(null, email), steam);
  const seed = createSeedSteamAccountSnapshot();
  const source = seed.orders.find((order) => order.status === "completed" && order.items.some((item) => item.kind === "skins"));
  assert.ok(source);
  const debit = seed.transactions.find((transaction) => transaction.orderNumber === source.number && transaction.reason === "purchase");
  const trade = seed.tradeEvents.find((event) => event.orderNumber === source.number && event.direction === "purchase");
  assert.ok(debit);
  assert.ok(trade);
  const futureOrder = { ...source, createdAt: "2099-01-01T00:00:00.000Z" };
  const snapshot = { ...seed, orders: seed.orders.map((order) => order.id === source.id ? futureOrder : order) };
  const state: PersistedMarketplaceState = {
    version: 5,
    revision: 31,
    cartIds: [],
    session: linked,
    currentAccountKey: email.id,
    accounts: { [email.id]: snapshot, [steam.id]: snapshot },
    identityLinks: { [email.id]: linked, [steam.id]: linked },
  };
  const values = new Map([["v5", JSON.stringify(state)]]);
  assert.equal(readNewestValidMarketplaceState({ getItem: (key: string) => values.get(key) ?? null }, [{ key: "v5", version: 5 }]), null);
});
