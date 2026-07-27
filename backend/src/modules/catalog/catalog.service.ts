import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { firstReleaseCatalogProducts } from "./catalog.seed";
import type {
  CatalogFacetOption,
  CatalogFacetsDto,
  CatalogListDto,
  CatalogListQuery,
  CatalogProduct,
  CatalogProductDto,
  CatalogProductKind,
  CatalogSort,
} from "./catalog.types";

const allowedKinds = new Set<CatalogProductKind>(["skins", "steam"]);
const allowedSorts = new Set<CatalogSort>(["relevance", "price-asc", "price-desc", "newest"]);
const relatedTerms: Record<CatalogProductKind, string[]> = {
  steam: ["steam", "стим", "пополнение", "баланс", "кошелек"],
  skins: ["скин", "скины", "предмет", "предметы", "cs2", "dota"],
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function arrayQuery(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function numberQuery(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function priceDto(priceCoins: number) {
  const amountMinor = priceCoins * 100;
  return {
    currency: "COINS" as const,
    amountMinor,
    scale: 2 as const,
    display: `${priceCoins.toLocaleString("ru-RU")} Coins`,
  };
}

function productDto(product: CatalogProduct): CatalogProductDto {
  return {
    id: product.id,
    slug: product.slug,
    kind: product.kind,
    category: product.category,
    ...(product.game === undefined ? {} : { game: product.game }),
    productType: product.productType,
    title: product.title,
    description: product.description,
    availability: product.availability,
    fulfillmentMode: product.fulfillmentMode,
    createdAt: product.createdAt,
    popularity: product.popularity,
    ...(product.image === undefined ? {} : { image: product.image }),
    ...(product.imageAlt === undefined ? {} : { imageAlt: product.imageAlt }),
    meta: product.meta,
    keywords: product.keywords,
    details: product.details,
    price: priceDto(product.priceCoins),
  };
}

function searchableText(product: CatalogProduct): string {
  return [
    product.title,
    product.description,
    product.category,
    product.game ?? "",
    product.productType,
    product.kind,
    ...product.meta,
    ...product.keywords,
    ...relatedTerms[product.kind],
  ]
    .map(normalize)
    .join(" ");
}

function matchesQuery(product: CatalogProduct, query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const exactGame = ["cs2", "dota 2", "rust"].find((game) => game === normalizedQuery);
  if (exactGame) return normalize(product.game ?? "") === exactGame;
  const haystack = searchableText(product);
  return normalizedQuery.split(/\s+/).filter(Boolean).every((term) => {
    if (term === "steam") return product.kind === "steam";
    return haystack.includes(term);
  });
}

function relevance(product: CatalogProduct, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return product.popularity;
  const title = normalize(product.title);
  const classification = normalize([product.category, product.game ?? "", product.productType].join(" "));
  const details = searchableText(product);
  return (
    (title.includes(normalizedQuery) ? 50 : 0)
    + (classification.includes(normalizedQuery) ? 20 : 0)
    + (details.includes(normalizedQuery) ? 10 : 0)
    + product.popularity / 100
  );
}

function facetOptions(products: CatalogProduct[], selector: (product: CatalogProduct) => string | undefined): CatalogFacetOption[] {
  return [...new Set(products.map(selector).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "ru-RU"))
    .map((value) => ({ id: value, title: value }));
}

function facets(products: CatalogProduct[]): CatalogFacetsDto {
  return {
    kinds: [
      { id: "skins", title: "Игровые предметы" },
      { id: "steam", title: "Steam" },
    ],
    games: facetOptions(products, (product) => product.game),
    productTypes: facetOptions(products, (product) => product.productType),
    fulfillmentModes: [
      { id: "automatic", title: "Автоматически" },
      { id: "steam-trade", title: "Steam Trade" },
    ],
    availability: [{ id: "available", title: "Доступен к оформлению" }],
  };
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(query: CatalogListQuery): Promise<CatalogListDto> {
    const products = await this.loadProducts();
    const category = allowedKinds.has(query.category as CatalogProductKind) ? query.category as CatalogProductKind : undefined;
    const statuses = new Set(arrayQuery(query.status));
    const types = arrayQuery(query.type).map(normalize);
    const fulfillmentModes = new Set(arrayQuery(query.fulfillment));
    const weaponTerms = arrayQuery(query.weapon).map(normalize);
    const min = numberQuery(query.min);
    const max = numberQuery(query.max);
    const minPrice = min !== undefined && max !== undefined && min > max ? max : min;
    const maxPrice = min !== undefined && max !== undefined && min > max ? min : max;
    const sort = allowedSorts.has(query.sort as CatalogSort) ? query.sort as CatalogSort : "relevance";
    const search = query.q ?? "";

    const items = products
      .filter((product) => category === undefined || product.kind === category)
      .filter((product) => statuses.size === 0 || statuses.has(product.availability))
      .filter((product) => types.length === 0 || types.some((type) => normalize(product.productType).includes(type)))
      .filter((product) => fulfillmentModes.size === 0 || fulfillmentModes.has(product.fulfillmentMode))
      .filter((product) => weaponTerms.length === 0 || weaponTerms.some((term) => searchableText(product).includes(term)))
      .filter((product) => minPrice === undefined || product.priceCoins >= minPrice)
      .filter((product) => maxPrice === undefined || product.priceCoins <= maxPrice)
      .filter((product) => matchesQuery(product, search))
      .sort((left, right) => {
        if (sort === "price-asc") return left.priceCoins - right.priceCoins;
        if (sort === "price-desc") return right.priceCoins - left.priceCoins;
        if (sort === "newest") return Date.parse(right.createdAt) - Date.parse(left.createdAt);
        return relevance(right, search) - relevance(left, search) || left.id.localeCompare(right.id);
      });

    return {
      items: items.map(productDto),
      facets: facets(products),
      pricing: {
        coinRate: {
          fiatCurrency: "RUB",
          fiatMinor: 100,
          coinMinor: 150,
          display: "1 RUB = 1.5 Coins",
        },
      },
    };
  }

  async getBySlug(slug: string): Promise<CatalogProductDto> {
    const product = (await this.loadProducts()).find((item) => item.slug === slug);
    if (!product) throw new NotFoundException("Product not found");
    return productDto(product);
  }

  private async loadProducts(): Promise<CatalogProduct[]> {
    if (!this.database.isConfigured()) return firstReleaseCatalogProducts;
    const result = await this.database.query<{
      id: string;
      slug: string;
      kind: CatalogProductKind;
      category: string;
      game: string | null;
      product_type: string;
      title: string;
      description: string;
      price_coin_minor: number;
      availability: CatalogProduct["availability"];
      fulfillment_mode: CatalogProduct["fulfillmentMode"];
      created_at: Date;
      popularity: number;
      image: string | null;
      image_alt: string | null;
      meta: string[];
      keywords: string[];
      details: CatalogProduct["details"];
    }>(
      `
        SELECT
          id,
          slug,
          kind,
          category,
          game,
          product_type,
          title,
          description,
          price_coin_minor,
          availability,
          fulfillment_mode,
          created_at,
          popularity,
          image,
          image_alt,
          meta,
          keywords,
          details
        FROM catalog_products
        WHERE public_enabled = true
          AND kind IN ('skins', 'steam')
        ORDER BY popularity DESC, created_at DESC, id ASC
      `,
    );
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      category: row.category,
      ...(row.game === null ? {} : { game: row.game }),
      productType: row.product_type,
      title: row.title,
      description: row.description,
      priceCoins: Math.floor(row.price_coin_minor / 100),
      availability: row.availability,
      fulfillmentMode: row.fulfillment_mode,
      createdAt: row.created_at.toISOString(),
      popularity: row.popularity,
      ...(row.image === null ? {} : { image: row.image }),
      ...(row.image_alt === null ? {} : { imageAlt: row.image_alt }),
      meta: row.meta,
      keywords: row.keywords,
      details: row.details,
    }));
  }
}
