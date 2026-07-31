import assert from "node:assert/strict";
import test from "node:test";

import { catalogProducts } from "../data/products.ts";
import {
  createDefaultCatalogFilters,
  createCanonicalCatalogReturnPath,
  filterAndSortCatalog,
  getProductStatusLabel,
  getCatalogResultTitle,
  getCatalogScrollStorageKey,
  shouldStoreCatalogScroll,
  parseCatalogScrollPosition,
  hasActiveCatalogFilters,
  parseCatalogSearchParams,
  serializeCatalogFilters,
  sanitizeCatalogReturnPath,
  searchCatalogProducts,
} from "./catalog.ts";

test("автодополнение канонизирует returnTo тем же порядком, что и каталог", () => {
  assert.equal(
    createCanonicalCatalogReturnPath("/catalog", "sort=price-desc&category=skins&q=old", "AWP"),
    "/catalog?q=AWP&category=skins&sort=price_desc",
  );
});
import { searchProducts } from "./marketplace.ts";

test("URL-параметры каталога разбираются в безопасные фильтры", () => {
  const filters = parseCatalogSearchParams(new URLSearchParams([
    ["q", "  Steam  "],
    ["category", "steam"],
    ["game", "rust"],
    ["status", "available"],
    ["status", "unknown"],
    ["type", "Пополнение баланса"],
    ["type", "Пополнение баланса"],
    ["condition", "Field-Tested"],
    ["weapon", "Автомат"],
    ["min", "750"],
    ["max", "5000"],
    ["sort", "price-desc"],
  ]));

  assert.deepEqual(filters, {
    query: "Steam",
    category: "steam",
    game: "rust",
    types: ["Пополнение баланса"],
    conditions: ["Field-Tested"],
    minPrice: 750,
    maxPrice: 5000,
    sort: "price_desc",
  });
});

test("легаси-фильтры наличия, выдачи и weapon игнорируются", () => {
  const filters = parseCatalogSearchParams(new URLSearchParams([
    ["status", "available"],
    ["fulfillment", "steam-trade"],
    ["weapon", "Автомат"],
  ]));

  assert.deepEqual(filters, createDefaultCatalogFilters());
});

test("невалидные URL-параметры сбрасываются без NaN и отрицательных цен", () => {
  const filters = parseCatalogSearchParams(new URLSearchParams({
    category: "casino",
    min: "-50",
    max: "not-a-number",
    sort: "popular",
  }));

  assert.deepEqual(filters, createDefaultCatalogFilters());
});

test("активные фильтры сериализуются без значений по умолчанию", () => {
  const serialized = serializeCatalogFilters({
    ...createDefaultCatalogFilters(),
    query: "AK-47",
    category: "skins",
    types: ["Автомат"],
    conditions: ["Field-Tested"],
    minPrice: 1000,
    maxPrice: 8000,
    sort: "price_asc",
    game: "rust",
  });

  assert.equal(
    serialized.toString(),
    "q=AK-47&category=skins&game=rust&type=%D0%90%D0%B2%D1%82%D0%BE%D0%BC%D0%B0%D1%82&condition=Field-Tested&min=1000&max=8000&sort=price_asc",
  );
  assert.equal(serializeCatalogFilters(createDefaultCatalogFilters()).toString(), "");
});

test("заголовок результатов каталога отражает выбранный раздел", () => {
  assert.equal(getCatalogResultTitle(createDefaultCatalogFilters()), "Все товары");
  assert.equal(
    getCatalogResultTitle({
      ...createDefaultCatalogFilters(),
      category: "steam",
      minPrice: 1,
      maxPrice: 500000,
    }),
    "Пополнение Steam",
  );
  assert.equal(
    getCatalogResultTitle({
      ...createDefaultCatalogFilters(),
      category: "skins",
      game: "cs2",
    }),
    "Скины CS2",
  );
  assert.equal(
    getCatalogResultTitle({
      ...createDefaultCatalogFilters(),
      query: "AK",
      category: "skins",
      game: "cs2",
    }),
    "Результаты по запросу «AK»",
  );
});

test("категория Steam не возвращает фиксированные карточки пополнения", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    category: "steam",
  });

  assert.equal(result.length, 0);
});

test("категория GPT возвращает только товары GPT", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    category: "gpt",
  });

  assert.equal(result.length, 4);
  assert.ok(result.every((product) => product.kind === "gpt"));
});

test("поиск по Steam не возвращает фиксированные карточки, а GPT находит отложенную категорию", () => {
  const steam = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "Steam",
  });
  const gpt = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "GPT",
  });

  assert.equal(steam.length, 0);
  assert.equal(gpt.length, 4);
  assert.ok(gpt.every((product) => product.kind === "gpt"));
});

test("поиск работает по тексту категории и названию товара", () => {
  const category = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "Игровые предметы",
  });
  const title = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "Printstream",
  });

  assert.equal(
    category.length,
    catalogProducts.filter((product) => product.kind === "skins").length,
  );
  assert.ok(category.every((product) => product.kind === "skins"));
  assert.deepEqual(title.map((product) => product.id), [
    "m4-printstream",
    "deagle-printstream",
  ]);
});

test("поиск Пистолет возвращает только Desert Eagle", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "Пистолет",
  });

  assert.deepEqual(result.map((product) => product.id), ["deagle-printstream"]);
});

test("поиск Автомат возвращает только AK-47 и M4A1-S", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "Автомат",
  });

  assert.deepEqual(result.map((product) => product.id), [
    "ak-redline",
    "m4-printstream",
  ]);
});

test("точный поиск по игре не смешивает игровые каталоги", () => {
  const expected = {
    CS2: ["ak-redline", "awp-asiimov", "m4-printstream", "deagle-printstream"],
    Rust: ["rust-tempered-ak47", "rust-alien-red-ak"],
    tf2: [],
  } as const;
  for (const [query, ids] of Object.entries(expected)) {
    const result = filterAndSortCatalog(catalogProducts, { ...createDefaultCatalogFilters(), query });
    assert.deepEqual(result.map((product) => product.id).sort(), [...ids].sort());
  }
});

test("поиск, фасеты, цена и сортировка работают совместно", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "Автомат",
    category: "skins",
    types: ["Автомат"],
    minPrice: 3000,
    maxPrice: 8000,
    sort: "price_desc",
  });

  assert.deepEqual(result.map((product) => product.id), ["m4-printstream"]);
});

test("фильтр по типу предмета работает отдельно от текстового поиска", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    category: "skins",
    types: ["снайперская"],
  });

  assert.deepEqual(result.map((product) => product.id), ["awp-asiimov"]);
});

test("фильтр по состоянию работает отдельно от текстового поиска", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    category: "skins",
    conditions: ["После полевых испытаний"],
  });

  assert.deepEqual(result.map((product) => product.id), [
    "ak-redline",
    "m4-printstream",
  ]);
});

test("несовместимые условия возвращают пустой результат", () => {
  const result = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    query: "GPT",
    category: "steam",
  });

  assert.deepEqual(result, []);
});

test("сброс возвращает независимое начальное состояние и все товары", () => {
  const defaults = createDefaultCatalogFilters();
  const secondDefaults = createDefaultCatalogFilters();

  assert.equal(hasActiveCatalogFilters(defaults), false);
  assert.notEqual(defaults.types, secondDefaults.types);
  assert.notEqual(defaults.conditions, secondDefaults.conditions);
  assert.equal(filterAndSortCatalog(catalogProducts, defaults).length, catalogProducts.length);
});

test("сортировки по цене и новизне дают предсказуемый порядок", () => {
  const priceAscending = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    sort: "price_asc",
  });
  const newest = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    sort: "newest",
  });

  assert.ok(priceAscending.every((product, index) => (
    index === 0 || priceAscending[index - 1].priceCoins <= product.priceCoins
  )));
  assert.equal(newest[0].id, "gpt-api-balance");
});

test("некорректные границы цены игнорируются, а обратный диапазон нормализуется", () => {
  const invalid = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    minPrice: Number.NaN,
    maxPrice: -100,
  });
  const reversed = filterAndSortCatalog(catalogProducts, {
    ...createDefaultCatalogFilters(),
    minPrice: 5000,
    maxPrice: 1000,
  });

  assert.equal(invalid.length, catalogProducts.length);
  assert.ok(reversed.length > 0);
  assert.ok(reversed.every((product) => (
    product.priceCoins >= 1000 && product.priceCoins <= 5000
  )));
});

test("статус отображения выводится из наличия и способа выдачи", () => {
  const skin = catalogProducts.find((product) => product.id === "ak-redline");
  const gpt = catalogProducts.find((product) => product.id === "gpt-plus");

  assert.ok(skin && gpt);
  assert.equal(getProductStatusLabel(skin), "Доступен к оформлению");
  assert.equal(getProductStatusLabel(gpt), "Локальный заказ");
});

test("статус под заказ имеет приоритет над способом выдачи", () => {
  const skin = catalogProducts.find((product) => product.id === "ak-redline");
  assert.ok(skin);

  assert.equal(getProductStatusLabel({
    ...skin,
    availability: "on-request",
  }), "Локальный заказ");
});

test("возврат из карточки сохраняет только безопасный URL каталога", () => {
  assert.equal(sanitizeCatalogReturnPath("/catalog?category=skins&game=cs2"), "/catalog?category=skins&game=cs2");
  assert.equal(sanitizeCatalogReturnPath("/account"), "/catalog");
  assert.equal(sanitizeCatalogReturnPath("https://example.com/catalog"), "/catalog");
});

test("позиция каталога привязана к безопасному контексту и проходит валидацию", () => {
  assert.equal(
    getCatalogScrollStorageKey("/catalog?category=skins&game=cs2"),
    "vault:catalog-scroll:/catalog?category=skins&game=cs2",
  );
  assert.equal(getCatalogScrollStorageKey("https://example.com"), "vault:catalog-scroll:/catalog");
  assert.equal(parseCatalogScrollPosition("1240"), 1240);
  assert.equal(parseCatalogScrollPosition("-10"), null);
  assert.equal(parseCatalogScrollPosition("not-a-number"), null);
  assert.equal(shouldStoreCatalogScroll("/catalog", "/catalog?category=skins"), true);
  assert.equal(shouldStoreCatalogScroll("/catalog/ak-47-redline", "/catalog?category=skins"), false);
});

test("autocomplete and catalog use the same search engine and result limit", () => {
  for (const query of ["Steam", "Пистолет", "автомат", "print", "Dota 2", "no-result"]) {
    assert.deepEqual(
      searchProducts(catalogProducts, query).map((product) => product.id),
      searchCatalogProducts(catalogProducts, query).map((product) => product.id),
    );
  }
  assert.equal(searchCatalogProducts(catalogProducts, "", 5).length, 5);
  assert.equal(searchCatalogProducts(catalogProducts, "Steam", 5).length, 0);
});

test("все товары явно отмечены как демонстрационные", () => {
  assert.ok(catalogProducts.every((product) => product.isMock === true));
});
