import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("checkout consent is invalidated by reviewed state changes and immutable review reaches checkoutCart", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(checkout, /review(?:ed)?Revision/i);
  assert.match(checkout, /setAccepted\(false\)/);
  assert.match(checkout, /Данные заказа обновились/i);
  assert.match(checkout, /checkoutCart\(fulfillment,\s*review/i);
  assert.match(provider, /expectedRevision:\s*review/i);
});

test("Steam settings and guest account gate preserve a nested checkout return", () => {
  const form = source("src/features/account/SteamTradeUrlForm.tsx");
  const shell = source("src/features/account/AccountShell.tsx");
  assert.match(form, /account%2Fsteam%3FreturnTo%3D%252Fcheckout/);
  assert.match(shell, /nestedReturnTo/);
  assert.match(shell, /createAccountAuthReturnPath\(pathname, nestedReturnTo\)/);
});

test("skin checkout renders the linked Steam identity, Trade URL and edit action", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  assert.match(checkout, /session\?\.steamAccount/);
  assert.match(checkout, /steamTradeUrl/);
  assert.match(checkout, /Изменить[\s\S]*Steam|Настроить Steam/);
  assert.match(checkout, /account\/steam\?returnTo=%2Fcheckout/);
});
