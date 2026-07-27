import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("cart has no query-driven false top-up success state", () => {
  assert.doesNotMatch(source("src/app/cart/page.tsx"), /topUp|showTopUpNotice/);
  assert.doesNotMatch(source("src/features/cart/CartScreen.tsx"), /Баланс пополнен|topUpNotice/);
});

test("missing Trade URL preserves checkout return and saved form returns safely", () => {
  assert.match(source("src/features/checkout/CheckoutScreen.tsx"), /account\/steam\?returnTo=%2Fcheckout/);
  assert.match(source("src/features/account/SteamTradeUrlForm.tsx"), /router\.replace\(returnTo\)/);
});

test("checkout discloses local Coins order and unavailable external fulfillment before consent", () => {
  const checkout = source("src/features/checkout/CheckoutScreen.tsx");
  assert.match(checkout, /локальн.*заказ/i);
  assert.match(checkout, /внешн.*(?:выдач|исполн).*не подключ/i);
  assert.match(checkout, /Я принимаю условия/);
});

test("visible product and catalog copy has no unsupported automatic fulfillment promises", () => {
  const copy = `${source("src/data/products.ts")}\n${source("src/lib/catalog.ts")}\n${source("src/features/catalog/CatalogScreen.tsx")}`;
  assert.doesNotMatch(copy, /Автовыдача|автоматическое пополнение|зачисляется .* после оформления|переда[её]тся через предложение обмена/i);
});

test("all visible coin rates use the localized centralized formatter", () => {
  const copy = `${source("src/data/products.ts")}\n${source("src/features/home/SteamTopUp.tsx")}\n${source("src/components/layout/SiteHeader.tsx")}`;
  assert.doesNotMatch(copy, /1 ₽ = 1\.5 Coins/);
  assert.doesNotMatch(copy, /\{summary\.rate\} Coins/);
});

test("mobile filters use a draft and an explicit apply action", () => {
  const catalog = source("src/features/catalog/CatalogScreen.tsx");
  assert.match(catalog, /draftFilters/);
  assert.match(catalog, />Применить фильтры</);
});

test("checkout error boundary has a page heading", () => {
  assert.match(source("src/app/checkout/error.tsx"), /<h1>/);
});

test("account labels persisted profile history without demo wording", () => {
  const account = `${source("src/features/account/AccountShell.tsx")}\n${source("src/features/account/AccountScreen.tsx")}`;
  assert.match(account, /Данные профиля/);
});

test("support reports local persistence failure in the form itself", () => {
  const support = source("src/features/support/SupportCenter.tsx");
  assert.match(support, /storageError/);
  assert.match(support, /role="alert"/);
});

test("both product return actions use the restoration-aware catalog link", () => {
  const detail = source("src/features/product/ProductDetailScreen.tsx");
  const purchase = source("src/features/product/ProductPurchaseAction.tsx");
  assert.match(detail, /<CatalogReturnLink/);
  assert.match(purchase, /<CatalogReturnLink/);
  assert.doesNotMatch(purchase, /href=\{catalogReturnHref\}/);
});

test("FAQ tabs cancel native arrow, Home and End key behavior", () => {
  const faq = source("src/features/home/FAQAccordion.tsx");
  assert.match(faq, /\["ArrowRight", "ArrowLeft", "Home", "End"\]\.includes\(event\.key\)/);
  assert.match(faq, /event\.preventDefault\(\)/);
});

test("home and cart storefront copy does not promise unavailable external fulfillment", () => {
  const copy = `${source("src/features/home/Hero.tsx")}\n${source("src/features/home/SteamTopUp.tsx")}\n${source("src/data/home.ts")}\n${source("src/features/cart/CartScreen.tsx")}`;
  assert.doesNotMatch(copy, /Пополняйте баланс Steam|оплачивайте доступ к GPT|<h2>Пополнить баланс Steam<\/h2>|В наличии|После пополнения вы верн[её]тесь/iu);
  assert.match(copy, /внешн.*не подключ/iu);
});

test("top-up page consistently describes a calculator without payment confirmation", () => {
  const topUp = source("src/features/top-up/TopUpScreen.tsx");
  assert.match(topUp, /Калькулятор Coins/);
  assert.match(topUp, /плат[её]ж.*не подключ/iu);
  assert.doesNotMatch(topUp, /Шаг 1 из 1|После пополнения|фиксируется до подтверждения платежа|Финальная сумма/iu);
});

test("privacy policy only claims controls that exist in the editable interface", () => {
  const legal = source("src/config/legal.ts");
  assert.doesNotMatch(legal, /Контактные данные .* можно изменить/);
  assert.match(legal, /Steam Trade URL можно изменить/);
});
