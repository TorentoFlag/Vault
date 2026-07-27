import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { catalogProducts } from "../data/products.ts";
import { createDefaultCatalogFilters, filterAndSortCatalog } from "./catalog.ts";

const headerSource = readFileSync(
  new URL("../components/layout/SiteHeader.tsx", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../components/layout/layout.module.css", import.meta.url),
  "utf8",
);
const productCardSource = readFileSync(
  new URL("../components/marketplace/ProductCard.tsx", import.meta.url),
  "utf8",
);

test("под поиском отображается навигация по услугам Vault", () => {
  assert.match(headerSource, /className=\{styles\.serviceNav\}/);
  assert.match(headerSource, /aria-label="Услуги Vault"/);

  for (const label of [
    "Все товары",
    "Пополнение Steam",
    "Скины CS2",
    "Скины Dota 2",
    "Скины Rust",
    "GPT-сервисы",
    "Пополнить Coins",
  ]) {
    assert.match(headerSource, new RegExp(label));
  }

  assert.doesNotMatch(headerSource, /GPT Plus/);
  assert.doesNotMatch(headerSource, /GPT API/);
});

test("ссылки меню ведут в существующие разделы и фильтры каталога", () => {
  for (const href of [
    "/catalog",
    "/catalog?category=steam",
    "/catalog?category=skins&q=CS2",
    "/catalog?category=skins&q=Dota%202",
    "/catalog?category=skins&q=Rust",
    "/catalog?category=gpt",
    "/balance/top-up",
  ]) {
    assert.match(headerSource, new RegExp(href.replace(/[?]/g, "\\?")));
  }
});

test("пункты Dota 2 и Rust открывают непустую выдачу игровых предметов", () => {
  for (const query of ["Dota 2", "Rust"]) {
    const filters = createDefaultCatalogFilters();
    filters.category = "skins";
    filters.query = query;

    const products = filterAndSortCatalog(catalogProducts, filters);

    assert.ok(products.length > 0, `Для ${query} должен быть хотя бы один товар`);
    assert.ok(products.every((product) => product.kind === "skins"));
  }
});

test("карточки скинов без изображения показывают название игры, а не GPT", () => {
  assert.match(productCardSource, /product\.kind === "skins"/);
  assert.match(productCardSource, /product\.game/);
});

test("меню услуг сохраняет одну строку и горизонтально прокручивается на узких экранах", () => {
  assert.match(
    stylesSource,
    /\.serviceNavInner\s*{[\s\S]*?overflow-x:\s*auto;[\s\S]*?}/,
  );
  assert.match(
    stylesSource,
    /\.serviceNav a\s*{[\s\S]*?white-space:\s*nowrap;[\s\S]*?}/,
  );
});
