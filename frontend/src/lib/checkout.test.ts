import assert from "node:assert/strict";
import test from "node:test";

import { canSubmitCheckout, getCheckoutGate } from "./checkout.ts";

const readyInput = {
  itemCount: 1,
  totalCoins: 2840,
  balanceCoins: 3000,
  isAuthenticated: true,
  requiresSteam: false,
  hasSteam: false,
  hasTradeUrl: false,
};

test("checkout сначала отклоняет пустую корзину", () => {
  assert.equal(getCheckoutGate({ ...readyInput, itemCount: 0, totalCoins: 0 }), "empty");
});

test("checkout до входа сначала требует авторизацию и не уводит гостя к пополнению", () => {
  assert.equal(getCheckoutGate({ ...readyInput, balanceCoins: 100, isAuthenticated: false }), "auth-required");
  assert.equal(getCheckoutGate({ ...readyInput, balanceCoins: 100, isAuthenticated: true }), "insufficient");
});

test("checkout требует авторизацию", () => {
  assert.equal(getCheckoutGate({ ...readyInput, isAuthenticated: false }), "auth-required");
});

test("checkout требует Steam только для игровых предметов", () => {
  assert.equal(getCheckoutGate({ ...readyInput, balanceCoins: 100, requiresSteam: true, hasSteam: false }), "steam-required");
  assert.equal(getCheckoutGate({ ...readyInput, balanceCoins: 100, requiresSteam: true, hasSteam: true }), "trade-url-required");
  assert.equal(getCheckoutGate({ ...readyInput, requiresSteam: true, hasSteam: false }), "steam-required");
  assert.equal(getCheckoutGate({ ...readyInput, requiresSteam: true, hasSteam: true }), "trade-url-required");
  assert.equal(getCheckoutGate({ ...readyInput, requiresSteam: true, hasSteam: true, hasTradeUrl: true }), "ready");
});

test("оформление доступно только после принятия условий", () => {
  assert.equal(canSubmitCheckout("ready", false), false);
  assert.equal(canSubmitCheckout("ready", true), true);
  assert.equal(canSubmitCheckout("insufficient", true), false);
});
