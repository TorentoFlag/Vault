import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("tablet search suggestions keep their grid alignment while exposing 44px hit areas", () => {
  const css = source("src/components/marketplace/marketplace.module.css");
  const tablet = css.match(/@media \(max-width: 1024px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(tablet, /\.searchResults a[\s\S]*display:\s*grid/);
  assert.match(tablet, /\.searchResults a[\s\S]*min-width:\s*44px/);
  assert.match(tablet, /\.searchResults a[\s\S]*min-height:\s*44px/);
  assert.doesNotMatch(tablet, /\.searchResults a[\s\S]*display:\s*inline-flex/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.searchResults a[\s\S]*grid-template-columns:/);
});

test("keyboard-active search suggestion has an explicit selected visual state", () => {
  const css = source("src/components/marketplace/marketplace.module.css");
  assert.match(css, /\.searchResults a\[aria-selected="true"\][\s\S]*background:/);
  assert.match(css, /\.searchResults a\[aria-selected="true"\][\s\S]*(border|color):/);
});

test("tablet account detail links and product state actions retain 44px targets", () => {
  const account = source("src/features/account/account.module.css");
  const product = source("src/features/product/product.module.css");
  const accountTablet = account.match(/@media \(max-width: 1024px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const productTablet = product.match(/@media \(max-width: 1024px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(accountTablet, /\.sidebarBalance a[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/);
  assert.match(accountTablet, /\.inlineOrderDetails a[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/);
  assert.match(productTablet, /\.stateActions a[\s\S]*min-width:\s*44px[\s\S]*min-height:\s*44px/);
});
