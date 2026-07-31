import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("auth uses server Steam start and cannot log out while loading", () => {
  const auth = source("src/features/auth/AuthScreen.tsx");
  assert.doesNotMatch(auth, /setTimeout\(resolve,\s*(?:550|650)/);
  assert.doesNotMatch(auth, /connectSteamDemo/);
  assert.match(auth, /buildSteamAuthStartUrl\(returnTo\)/);
  assert.match(auth, /disabled=\{isLoading\}[\s\S]{0,120}>Выйти/);
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /client\.getCurrentUser\(\)/);
  assert.match(provider, /setSession\(sessionFromApiUser\(user\)\)/);
  assert.doesNotMatch(provider, /activateSession|connectSteamDemo/);
});

test("query-driven auth and top-up pages are not forced static", () => {
  assert.doesNotMatch(source("src/app/auth/page.tsx"), /dynamic\s*=\s*["']force-static["']/);
  assert.doesNotMatch(source("src/app/balance/top-up/page.tsx"), /dynamic\s*=\s*["']force-static["']/);
});

test("skin cart gates Steam and Trade URL before balance top-up", () => {
  const cart = source("src/features/cart/CartScreen.tsx");
  const steamGate = cart.indexOf("requiresSteam && !hasSteam");
  const tradeGate = cart.indexOf("requiresSteam && !hasSteamTradeUrl");
  const balanceGate = cart.indexOf("!hasSufficientBalance");
  assert.ok(steamGate >= 0 && tradeGate > steamGate && balanceGate > tradeGate);
  assert.match(cart, /account\/steam\?returnTo=%2Fcart/);
});

test("Steam Trade URL settings persist through backend without exposing saved token in the input", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  const form = source("src/features/account/SteamTradeUrlForm.tsx");
  assert.match(provider, /isServerBacked[\s\S]{0,500}putSteamTradeUrl\(normalized\)/);
  assert.match(provider, /setServerSteamTradeUrlConfigured\(true\)/);
  assert.match(form, /const value = draftValue \?\? \"\"/);
  assert.match(form, /hasSteamTradeUrl \? "Trade URL сохранён" : "Trade URL не добавлен"/);
});

test("backend sessions hydrate account purchases from backend order history", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /client\.getOrderHistory\(\)/);
  assert.match(provider, /setOrders\(orderHistory\)/);
});

test("backend sessions hydrate Coins operations from backend wallet transaction history", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /client\.getWalletTransactions\(\)/);
  assert.match(provider, /setTransactions\(walletTransactions\)/);
});

test("backend sessions hydrate account inventory from backend projection", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  const account = source("src/features/account/AccountScreen.tsx");
  assert.match(provider, /client\.getInventory\(\)/);
  assert.match(provider, /setInventoryItems\(inventory\)/);
  assert.match(account, /inventoryItems/);
  assert.match(account, /item\.actions\.sellToSite\.enabled/);
  assert.match(account, /disabled=\{!item\.actions\.sellToSite\.enabled\}/);
  assert.doesNotMatch(account, /Coins зачисляются сразу после локального подтверждения продажи/);
});

test("backend sessions hydrate Steam trade history from backend fulfillment projection", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  const account = source("src/features/account/AccountScreen.tsx");
  assert.match(provider, /client\.getFulfillmentTradeHistory\(\)/);
  assert.match(provider, /setTradeEvents\(tradeHistory\)/);
  assert.doesNotMatch(account, /Локальные записи заказов и действий с игровыми предметами/);
});

test("backend sessions create inventory withdrawals through backend action endpoint", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /client\.createInventoryWithdrawal\(/);
  assert.match(provider, /setInventoryItems\(inventory\)/);
  assert.match(provider, /setTradeEvents\(tradeHistory\)/);
});

test("storage events compare against the live persisted ref", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /parseMarketplaceStorageEvent\(STORAGE_KEY, event, persistedStateRef\.current\.revision\)/);
});

test("measured compact links expose centered 44px square hit areas", () => {
  const home = source("src/features/home/home.module.css");
  const layout = source("src/components/layout/layout.module.css");
  const support = source("src/features/support/support.module.css");
  const account = source("src/features/account/account.module.css");
  for (const css of [home, layout, support, account]) {
    assert.match(css, /min-width:\s*44px/);
    assert.match(css, /justify-content:\s*center/);
  }
});
