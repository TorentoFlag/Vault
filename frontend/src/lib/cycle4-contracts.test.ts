import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("checkout is serialized against the latest persisted state and listens for cross-tab storage changes", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  assert.match(provider, /navigator\.locks|requestMarketplaceLock/);
  assert.match(provider, /addEventListener\("storage"/);
  assert.match(provider, /readPersistedMarketplaceState/);
  assert.match(provider, /steamTradeUrl:/);
});

test("auth method switching releases its submit lock and identity conflicts are visible", () => {
  const auth = source("src/features/auth/AuthScreen.tsx");
  assert.match(auth, /function selectMethod[\s\S]*submitLock\.current = false/);
  assert.match(auth, /result\.message|identity.*conflict|уже связан/i);
});

test("support clear retains the draft when local removal fails", () => {
  const support = source("src/features/support/SupportCenter.tsx");
  assert.doesNotMatch(support, /catch \{ \/\* Storage is unavailable\. \*\/ \}/);
  assert.match(support, /Не удалось очистить черновик/);
});

test("catalog autocomplete preserves catalog context only while currently in catalog", () => {
  const search = source("src/components/marketplace/MarketplaceSearch.tsx");
  assert.match(search, /usePathname/);
  assert.match(search, /pathname (?:===|!==) "\/catalog"/);
  assert.match(search, /returnTo=/);
  assert.match(search, /href=\{getDetailHref\(product\)\}/);
  assert.doesNotMatch(search, /event\.preventDefault\(\)[\s\S]{0,180}router\.push\(getDetailHref\(product\)\)/);
});

test("checkout captures the reviewed state before any asynchronous delay", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  const submit = checkout.slice(checkout.indexOf("async function submit"), checkout.indexOf("return (", checkout.indexOf("async function submit")));
  assert.doesNotMatch(submit, /setTimeout/);
  assert.match(submit, /checkoutCart\(fulfillment, review\)/);
});

test("unsupported Web Locks produce an explicit user-facing error", () => {
  const provider = source("src/components/marketplace/MarketplaceProvider.tsx");
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  assert.match(provider, /Безопасное сохранение недоступно/);
  assert.match(checkout, /Безопасное оформление недоступно/);
});

test("auth completion branches on the committed session and keeps checkout return", () => {
  const auth = source("src/features/auth/AuthScreen.tsx");
  assert.match(auth, /result\.session\.steamAccount/);
  assert.match(auth, /finishAndReturn\(result\.session\)/);
});

test("account Steam CTA preserves a nested checkout return", () => {
  const account = source("src/features/account/AccountScreen.tsx");
  assert.match(account, /returnTo === "\/checkout"[\s\S]*%2Faccount%2Fsteam%3FreturnTo%3D%252Fcheckout/);
});

test("standalone footer, support and account actions expose 44px touch targets", () => {
  const layout = source("src/components/layout/layout.module.css");
  const support = source("src/features/support/support.module.css");
  const account = source("src/features/account/account.module.css");
  assert.match(layout, /\.footerColumn a[\s\S]{0,180}min-height:\s*44px/);
  assert.match(support, /\.faqHeading a[\s\S]{0,180}min-height:\s*44px/);
  assert.match(support, /\.faqList summary[\s\S]{0,180}min-height:\s*44px/);
  assert.match(account, /\.connectionList a[\s\S]{0,180}min-height:\s*44px/);
});

test("calculator controls and Steam input expose accessible validation", () => {
  const steam = source("src/features/home/SteamTopUp.tsx");
  const css = source("src/features/home/home.module.css");
  assert.match(steam, /aria-invalid=/);
  assert.match(steam, /aria-describedby=/);
  assert.match(css, /\.modeSwitch button[\s\S]*min-height:\s*44px/);
});

test("global 404 declares contextual metadata", () => {
  const notFound = source("src/app/not-found.tsx");
  assert.match(notFound, /Metadata/);
  assert.match(notFound, /title:\s*"Страница не найдена/);
});
