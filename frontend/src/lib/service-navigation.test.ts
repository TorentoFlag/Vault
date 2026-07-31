import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    "Скины Rust",
    "Скины TF2",
    "Пополнить Coins",
  ]) {
    assert.match(headerSource, new RegExp(label));
  }

  assert.doesNotMatch(headerSource, /GPT Plus/);
  assert.doesNotMatch(headerSource, /GPT API/);
  assert.doesNotMatch(headerSource, /Скины Dota 2/);
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
    assert.match(headerSource, new RegExp(href.replace(/[?]/g, "\\?")));
  }
  assert.doesNotMatch(headerSource, /category=gpt/);
  assert.doesNotMatch(headerSource, /q=Dota%202/);
  assert.doesNotMatch(headerSource, /q=Rust/);
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
    stylesSource,
    /\.serviceNavInner\s*{[\s\S]*?overflow-x:\s*auto;[\s\S]*?}/,
  );
  assert.match(
    stylesSource,
    /\.serviceNav a\s*{[\s\S]*?white-space:\s*nowrap;[\s\S]*?}/,
  );
});
