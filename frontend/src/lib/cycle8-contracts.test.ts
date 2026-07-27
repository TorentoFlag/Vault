import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("auth commits immediately from click-bound provider intents and cannot log out while loading", () => {
  const auth = source("src/features/auth/AuthScreen.tsx");
  assert.doesNotMatch(auth, /setTimeout\(resolve,\s*(?:550|650)/);
  assert.match(auth, /disabled=\{isLoading\}[\s\S]{0,120}>Выйти/);
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /createMarketplaceMutationOrigin\(persistedStateRef\.current\)[\s\S]{0,500}activateSession/);
});

test("skin cart gates Steam and Trade URL before balance top-up", () => {
  const cart = source("src/features/cart/CartScreen.tsx");
  const steamGate = cart.indexOf("requiresSteam && !hasSteam");
  const tradeGate = cart.indexOf("requiresSteam && !steamTradeUrl");
  const balanceGate = cart.indexOf("!hasSufficientBalance");
  assert.ok(steamGate >= 0 && tradeGate > steamGate && balanceGate > tradeGate);
  assert.match(cart, /account\/steam\?returnTo=%2Fcart/);
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
