import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("consent reacceptance clears stale review announcements", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  assert.match(checkout, /event\.target\.checked\)[\s\S]{0,120}setReviewNotice\(""\)/);
});

test("tablet footer uses a collision-safe three-column grid", () => {
  const layout = source("src/components/layout/layout.module.css");
  assert.match(layout, /@media \(max-width: 1024px\)[\s\S]{0,500}\.footerMain\s*\{[\s\S]{0,100}grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

test("essential form controls retain a visible two-pixel focus ring", () => {
  for (const path of ["src/features/auth/auth.module.css", "src/features/support/support.module.css", "src/features/account/account.module.css", "src/features/catalog/catalog.module.css"]) {
    assert.match(source(path), /:focus-visible[\s\S]{0,160}(outline:\s*2px|box-shadow:\s*0 0 0 2px)/, path);
  }
});

test("tablet standalone links and account controls preserve 44px targets", () => {
  const account = source("src/features/account/account.module.css");
  const cart = source("src/features/cart/cart.module.css");
  assert.match(account, /@media \(max-width: 1024px\)[\s\S]*(min-height:\s*44px)/);
  assert.match(cart, /@media \(max-width: 1024px\)[\s\S]*(min-height:\s*44px)/);
});
