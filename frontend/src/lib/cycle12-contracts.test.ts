import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("support adopts the committed draft returned by a successful save", () => {
  const support = source("src/features/support/SupportCenter.tsx");
  assert.match(support, /result\.status === "saved"[\s\S]{0,500}savedDraftRef\.current = result\.draft/);
  assert.match(support, /result\.status === "saved"[\s\S]{0,500}setSavedDraft\(result\.draft\)/);
  assert.match(support, /result\.status === "saved"[\s\S]{0,500}setForm\(\{[\s\S]{0,220}result\.draft\.subject/);
});

test("reaccepting checkout consent clears both stale review messages", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  assert.match(checkout, /event\.target\.checked[\s\S]{0,220}setReviewNotice\(""\)[\s\S]{0,120}setErrorMessage\(""\)/);
});

test("high-traffic local controls retain explicit two-pixel focus indicators", () => {
  for (const path of [
    "src/features/home/home.module.css",
    "src/components/marketplace/marketplace.module.css",
    "src/features/top-up/top-up.module.css",
  ]) {
    assert.match(source(path), /:focus-visible[\s\S]{0,180}(outline:\s*2px|box-shadow:\s*0 0 0 2px)/, path);
  }
  assert.match(source("src/components/marketplace/marketplace.module.css"), /\.searchForm:focus-within[\s\S]{0,160}(outline:\s*2px|box-shadow:\s*0 0 0 2px)/);
  assert.match(source("src/features/top-up/top-up.module.css"), /\.amountControl:focus-within[\s\S]{0,160}(outline:\s*2px|box-shadow:\s*0 0 0 2px)/);
});

test("tablet standalone account, home and product links retain 44px targets", () => {
  const account = source("src/features/account/account.module.css");
  const marketplace = source("src/components/marketplace/marketplace.module.css");
  const product = source("src/features/product/product.module.css");
  assert.match(account, /@media \(max-width: 1024px\)[\s\S]{0,900}\.balanceHero a,[\s\S]{0,160}\.accountReadiness a[\s\S]{0,220}min-height:\s*44px/);
  assert.match(marketplace, /@media \(max-width: 1024px\)[\s\S]{0,260}\.productTitleLink[\s\S]{0,140}min-height:\s*44px/);
  assert.match(product, /@media \(max-width: 1024px\)[\s\S]{0,260}\.relatedHeading > a[\s\S]{0,140}min-height:\s*44px/);
});
