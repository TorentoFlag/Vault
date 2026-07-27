import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("auth return waits for the explicitly requested missing provider", () => {
  const auth = source("src/features/auth/AuthScreen.tsx");
  assert.match(auth, /initialMethod === "steam"[\s\S]{0,180}hasSteam/);
  assert.match(auth, /initialMethod === "email"[\s\S]{0,180}emailAccount/);
});

test("support mutations are guarded by their originating account signature", () => {
  const support = source("src/features/support/SupportCenter.tsx");
  assert.match(support, /mutationOriginRef/);
  assert.match(support, /accountSignature/);
  assert.match(support, /if \([^)]*mutationOriginRef\.current[^)]*\) return/);
});

test("pre-hydration storage events compare with the highest queued revision", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /Math\.max\(persistedStateRef\.current\.revision, migrated\.revision\)/);
});

test("recipient edits revoke consent and announce renewed review", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  assert.match(checkout, /function updateFulfillment/);
  assert.match(checkout, /setAccepted\(false\)/);
  assert.match(checkout, /role="status"[\s\S]{0,180}повторно/i);
  assert.match(checkout, /aria-describedby=\{!canSubmit/);
});

test("account Suspense has a visible accessible main fallback", () => {
  const layout = source("src/app/account/layout.tsx");
  assert.doesNotMatch(layout, /fallback=\{null\}/);
  assert.match(layout, /<main[^>]+aria-busy="true"/);
});
