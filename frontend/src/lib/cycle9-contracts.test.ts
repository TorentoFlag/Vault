import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createCheckoutReviewKey } from "./checkout.ts";
import { createAccountAuthReturnPath, sanitizeAuthReturnPath } from "./auth.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("checkout review keys are collision-proof across all reviewed recipient fields", () => {
  const base = { revision: 7, sessionSignature: "email:a@example.com|steam:1", cartIds: ["a", "b"], steamTradeUrl: "https://steam.example/trade", steamLogin: "ab:c", gptEmail: "d@example.com" };
  const changed = { ...base, steamLogin: "ab", gptEmail: "c:d@example.com" };
  assert.notEqual(createCheckoutReviewKey(base), createCheckoutReviewKey(changed));
  assert.equal(createCheckoutReviewKey(base), createCheckoutReviewKey({ ...base }));
});

test("Steam Trade URL flow preserves a cart return through account and auth nesting", () => {
  assert.equal(createAccountAuthReturnPath("/account/steam", "/cart"), "/account/steam?returnTo=%2Fcart");
  assert.equal(sanitizeAuthReturnPath("/account/steam?returnTo=%2Fcart"), "/account/steam?returnTo=%2Fcart");
  const account = source("src/features/account/AccountScreen.tsx");
  const form = source("src/features/account/SteamTradeUrlForm.tsx");
  const page = source("src/app/account/steam/page.tsx");
  assert.match(account, /"\/checkout" \| "\/cart"/);
  assert.match(form, /returnTo === "\/checkout" \|\| returnTo === "\/cart"/);
  assert.match(page, /returnTo === "\/cart"/);
});

test("already-connected auth honors a safe return after hydration", () => {
  const auth = source("src/features/auth/AuthScreen.tsx");
  assert.match(auth, /isHydrated[\s\S]{0,300}returnTo[\s\S]{0,300}router\.replace\(returnTo\)/);
});

test("tablet interaction targets stay at least 44px in both dimensions", () => {
  for (const path of [
    "src/components/ui/ui.module.css",
    "src/components/layout/layout.module.css",
    "src/features/product/product.module.css",
    "src/features/checkout/checkout.module.css",
    "src/features/account/account.module.css",
    "src/features/auth/auth.module.css",
    "src/features/legal/legal-shell.module.css",
    "src/app/globals.css",
  ]) {
    const css = source(path);
    assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/, path);
  }
});
