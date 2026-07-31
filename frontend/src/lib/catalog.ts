import type { Product } from "../types/commerce.ts";
import type { ProductFilter } from "./marketplace.ts";
import { searchProducts } from "./marketplace.ts";
import { CATALOG_GAMES, parseCatalogGame, type CatalogGame } from "./catalog-games.ts";

export type CatalogSort =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "name_asc"
  | "name_desc";

export type CatalogFilters = {
  query: string;
  category: ProductFilter;
  game?: CatalogGame;
  types: string[];
  conditions: string[];
  minPrice?: number;
  maxPrice?: number;
  sort: CatalogSort;
};

export function createDefaultCatalogFilters(): CatalogFilters {
  return {
    query: "",
    category: "all",
    types: [],
    conditions: [],
    sort: "relevance",
  };
}

const productFilters: ProductFilter[] = ["all", "steam", "skins"];
const catalogSorts: CatalogSort[] = ["relevance", "price_asc", "price_desc", "newest", "name_asc", "name_desc"];
type CatalogSearchParams = Pick<URLSearchParams, "get" | "getAll">;

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parsePrice(value: string | null) {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function normalizePriceBounds(minPrice?: number, maxPrice?: number) {
  const min = Number.isFinite(minPrice) && minPrice! >= 0 ? minPrice : undefined;
  const max = Number.isFinite(maxPrice) && maxPrice! >= 0 ? maxPrice : undefined;

  return min !== undefined && max !== undefined && min > max
    ? { minPrice: max, maxPrice: min }
    : { minPrice: min, maxPrice: max };
}

export function parseCatalogSearchParams(searchParams: CatalogSearchParams): CatalogFilters {
  const defaults = createDefaultCatalogFilters();
  const category = searchParams.get("category");
  const sort = normalizeSort(searchParams.get("sort"));
  const game = parseCatalogGame(searchParams.get("game"));
  const { minPrice, maxPrice } = normalizePriceBounds(
    parsePrice(searchParams.get("min")),
    parsePrice(searchParams.get("max")),
  );

  return {
    query: searchParams.get("q")?.trim() ?? defaults.query,
    category: productFilters.includes(category as ProductFilter)
      ? category as ProductFilter
      : defaults.category,
    ...(game === undefined ? {} : { game }),
    types: uniqueValues(searchParams.getAll("type")),
    conditions: uniqueValues(searchParams.getAll("condition")),
    ...(minPrice === undefined ? {} : { minPrice }),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    sort: catalogSorts.includes(sort as CatalogSort)
      ? sort as CatalogSort
      : defaults.sort,
  };
}

function normalizeSort(value: string | null): string | null {
  if (value === "price-asc") return "price_asc";
  if (value === "price-desc") return "price_desc";
  return value;
}

export function serializeCatalogFilters(filters: CatalogFilters) {
  const searchParams = new URLSearchParams();
  const query = filters.query.trim();
  const { minPrice, maxPrice } = normalizePriceBounds(filters.minPrice, filters.maxPrice);

  if (query) searchParams.set("q", query);
  if (filters.category !== "all") searchParams.set("category", filters.category);
  if (filters.game !== undefined) searchParams.set("game", filters.game);
  filters.types.forEach((type) => searchParams.append("type", type));
  filters.conditions.forEach((condition) => searchParams.append("condition", condition));
  if (minPrice !== undefined) searchParams.set("min", String(minPrice));
  if (maxPrice !== undefined) searchParams.set("max", String(maxPrice));
  if (filters.sort !== "relevance") searchParams.set("sort", filters.sort);

  return searchParams;
}

export function createCanonicalCatalogReturnPath(pathname: string, currentSearch: string, query: string) {
  const searchParams = new URLSearchParams(currentSearch);
  const normalizedQuery = query.trim();
  if (normalizedQuery) searchParams.set("q", normalizedQuery);
  else searchParams.delete("q");
  const canonical = serializeCatalogFilters(parseCatalogSearchParams(searchParams)).toString();
  return canonical ? `${pathname}?${canonical}` : pathname;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function searchableText(product: Product) {
  return [
    product.title,
    product.description,
    product.category,
    product.game ?? "",
    product.productType,
    product.kind,
    ...product.meta,
    ...(product.keywords ?? []),
  ]
    .map(normalize)
    .join(" ");
}

function matchesAnyTerm(values: string[], selectedTerms: string[]) {
  if (selectedTerms.length === 0) {
    return true;
  }

  const normalizedValues = values.map(normalize).join(" ");
  return selectedTerms.some((term) => normalizedValues.includes(normalize(term)));
}

function relevanceScore(product: Product, query: string) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return product.popularity;
  }

  const title = normalize(product.title);
  const classification = normalize([
    product.category,
    product.game ?? "",
    product.productType,
  ].join(" "));
  const details = searchableText(product);

  return (
    (title.includes(normalizedQuery) ? 50 : 0)
    + (classification.includes(normalizedQuery) ? 20 : 0)
    + (details.includes(normalizedQuery) ? 10 : 0)
    + product.popularity / 100
  );
}

export function hasActiveCatalogFilters(filters: CatalogFilters) {
  const { minPrice, maxPrice } = normalizePriceBounds(filters.minPrice, filters.maxPrice);

  return Boolean(
    normalize(filters.query)
    || filters.category !== "all"
    || filters.game !== undefined
    || filters.types.length
    || filters.conditions.length
    || minPrice !== undefined
    || maxPrice !== undefined
    || filters.sort !== "relevance",
  );
}

function productCondition(product: Product) {
  return product.details.specifications.find((item) => normalize(item.label) === "состояние")?.value;
}

export function filterAndSortCatalog(
  products: Product[],
  filters: CatalogFilters,
) {
  const normalizedQuery = normalize(filters.query);
  const searchMatches = new Set(searchProducts(products, normalizedQuery).map((product) => product.id));
  const { minPrice, maxPrice } = normalizePriceBounds(
    filters.minPrice,
    filters.maxPrice,
  );

  const filtered = products.filter((product) => {
    const matchesQuery = searchMatches.has(product.id);
    const matchesCategory = filters.category === "all"
      || product.kind === filters.category;
    const matchesGame = filters.game === undefined
      || (product.kind === "skins" && normalize(product.game ?? "") === filters.game);
    const matchesType = matchesAnyTerm([product.productType], filters.types);
    const matchesCondition = matchesAnyTerm(
      [productCondition(product) ?? "", ...product.meta],
      filters.conditions,
    );
    const matchesMin = minPrice === undefined
      || product.priceCoins >= minPrice;
    const matchesMax = maxPrice === undefined
      || product.priceCoins <= maxPrice;

    return matchesQuery
      && matchesCategory
      && matchesGame
      && matchesType
      && matchesCondition
      && matchesMin
      && matchesMax;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "price_asc") {
      return left.priceCoins - right.priceCoins;
    }

    if (filters.sort === "price_desc") {
      return right.priceCoins - left.priceCoins;
    }

    if (filters.sort === "newest") {
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    }

    if (filters.sort === "name_asc") {
      return left.title.localeCompare(right.title, "ru-RU");
    }

    if (filters.sort === "name_desc") {
      return right.title.localeCompare(left.title, "ru-RU");
    }

    return relevanceScore(right, normalizedQuery) - relevanceScore(left, normalizedQuery);
  });
}

export function searchCatalogProducts(products: Product[], query: string, limit = Number.POSITIVE_INFINITY) {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : products.length;
  return searchProducts(products, query).slice(0, safeLimit);
}

export function getProductStatusLabel(product: Product) {
  if (product.availability === "on-request") {
    return "Локальный заказ";
  }

  return "Доступен к оформлению";
}

export function sanitizeCatalogReturnPath(value: string | null | undefined) {
  if (!value) return "/catalog";
  try {
    const url = new URL(value, "https://vault.local");
    return url.origin === "https://vault.local" && url.pathname === "/catalog"
      ? `${url.pathname}${url.search}`
      : "/catalog";
  } catch {
    return "/catalog";
  }
}

export function getCatalogScrollStorageKey(returnHref: string | null | undefined) {
  return `vault:catalog-scroll:${sanitizeCatalogReturnPath(returnHref)}`;
}

export function shouldStoreCatalogScroll(pathname: string, returnHref: string | null | undefined) {
  return pathname === "/catalog" && sanitizeCatalogReturnPath(returnHref).startsWith("/catalog");
}

export function parseCatalogScrollPosition(value: string | null | undefined) {
  if (!value) return null;
  const position = Number(value);
  return Number.isFinite(position) && position >= 0 ? position : null;
}
