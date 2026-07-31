import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerSource = readFileSync(
  new URL("../components/layout/SiteHeader.tsx", import.meta.url),
  "utf8",
);
const serviceNavigationSource = readFileSync(
  new URL("./service-navigation.ts", import.meta.url),
  "utf8",
);
const catalogStylesSource = readFileSync(
  new URL("../features/catalog/catalog.module.css", import.meta.url),
  "utf8",
);
const productCardSource = readFileSync(
  new URL("../components/marketplace/ProductCard.tsx", import.meta.url),
  "utf8",
);
const catalogSource = readFileSync(
  new URL("../features/catalog/CatalogScreen.tsx", import.meta.url),
  "utf8",
);

test("сервисная навигация хранит первый релиз без GPT и Dota 2", () => {
  for (const label of [
    "Все товары",
    "Пополнение Steam",
    "Скины CS2",
    "Скины Rust",
    "Скины TF2",
    "Пополнить Coins",
  ]) {
    assert.match(serviceNavigationSource, new RegExp(label));
  }

  assert.doesNotMatch(serviceNavigationSource, /GPT Plus/);
  assert.doesNotMatch(serviceNavigationSource, /GPT API/);
  assert.doesNotMatch(serviceNavigationSource, /Скины Dota 2/);
});

test("верхний header больше не дублирует сервисную навигацию каталога", () => {
  assert.doesNotMatch(headerSource, /className=\{styles\.serviceNav\}/);
  assert.doesNotMatch(headerSource, /aria-label="Услуги Vault"/);
  assert.doesNotMatch(headerSource, /serviceNavigation\.map/);
});

test("ссылки меню ведут в существующие разделы и фильтры каталога", () => {
  for (const href of [
    "/catalog",
    "/catalog?category=steam",
    "/catalog?category=skins&game=cs2",
    "/catalog?category=skins&game=rust",
    "/catalog?category=skins&game=tf2",
    "/balance/top-up",
  ]) {
    assert.match(serviceNavigationSource, new RegExp(href.replace(/[?]/g, "\\?")));
  }
  assert.doesNotMatch(serviceNavigationSource, /category=gpt/);
  assert.doesNotMatch(serviceNavigationSource, /q=Dota%202/);
  assert.doesNotMatch(serviceNavigationSource, /q=Rust/);
});

test("поиск в шапке не питается локальным seed catalog", () => {
  assert.doesNotMatch(headerSource, /catalogProducts/);
  assert.match(headerSource, /<MarketplaceSearch key=\{`\$\{query}:\$\{currentSearch}`} products=\{\[]}/);
});

test("карточки скинов без изображения не показывают legacy Steam item placeholder", () => {
  assert.doesNotMatch(productCardSource, /Steam item/);
});

test("меню услуг сохраняет одну строку и горизонтально прокручивается на узких экранах", () => {
  assert.match(
    catalogStylesSource,
    /\.catalogServiceNav\s*{[\s\S]*?overflow-x:\s*auto;[\s\S]*?}/,
  );
  assert.match(
    catalogStylesSource,
    /\.catalogServiceNav a\s*{[\s\S]*?white-space:\s*nowrap;[\s\S]*?}/,
  );
});

test("каталог использует сервисную навигацию как единственный ряд категорий под заголовком", () => {
  assert.match(catalogSource, /catalogServiceNav/);
  assert.doesNotMatch(catalogSource, /aria-label="Категории каталога"/);
  assert.doesNotMatch(catalogSource, /aria-label="Игры каталога"/);
});
