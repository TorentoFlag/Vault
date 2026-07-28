import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { CatalogPricingService } from "./catalog-pricing.service";
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

type LoadedCatalogProduct = CatalogProduct & {
  priceCoinMinor?: number;
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

function priceDto(amountMinor: number) {
  return {
    currency: "COINS" as const,
    amountMinor,
    scale: 2 as const,
    display: amountMinor % 100 === 0
      ? `${(amountMinor / 100).toLocaleString("ru-RU")} Coins`
      : `${(amountMinor / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Coins`,
  };
}

function priceCoinMinor(product: LoadedCatalogProduct): number {
  return product.priceCoinMinor ?? product.priceCoins * 100;
}

function productDto(product: LoadedCatalogProduct): CatalogProductDto {
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
    price: priceDto(priceCoinMinor(product)),
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

function facetOptions(products: LoadedCatalogProduct[], selector: (product: LoadedCatalogProduct) => string | undefined): CatalogFacetOption[] {
  return [...new Set(products.map(selector).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "ru-RU"))
    .map((value) => ({ id: value, title: value }));
}

function facets(products: LoadedCatalogProduct[]): CatalogFacetsDto {
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
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CatalogPricingService)
    private readonly pricing: CatalogPricingService,
  ) {}

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
    const minPriceCoinMinor = minPrice === undefined ? undefined : minPrice * 100;
    const maxPriceCoinMinor = maxPrice === undefined ? undefined : maxPrice * 100;
    const sort = allowedSorts.has(query.sort as CatalogSort) ? query.sort as CatalogSort : "relevance";
    const search = query.q ?? "";

    const items = products
      .filter((product) => category === undefined || product.kind === category)
      .filter((product) => statuses.size === 0 || statuses.has(product.availability))
      .filter((product) => types.length === 0 || types.some((type) => normalize(product.productType).includes(type)))
      .filter((product) => fulfillmentModes.size === 0 || fulfillmentModes.has(product.fulfillmentMode))
      .filter((product) => weaponTerms.length === 0 || weaponTerms.some((term) => searchableText(product).includes(term)))
      .filter((product) => minPriceCoinMinor === undefined || priceCoinMinor(product) >= minPriceCoinMinor)
      .filter((product) => maxPriceCoinMinor === undefined || priceCoinMinor(product) <= maxPriceCoinMinor)
      .filter((product) => matchesQuery(product, search))
      .sort((left, right) => {
        if (sort === "price-asc") return priceCoinMinor(left) - priceCoinMinor(right);
        if (sort === "price-desc") return priceCoinMinor(right) - priceCoinMinor(left);
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

  private async loadProducts(): Promise<LoadedCatalogProduct[]> {
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
      supplier_price_microusd: string | null;
    }>(
      `
        SELECT
          catalog_products.id,
          catalog_products.slug,
          catalog_products.kind,
          catalog_products.category,
          catalog_products.game,
          catalog_products.product_type,
          catalog_products.title,
          catalog_products.description,
          catalog_products.price_coin_minor,
          catalog_products.availability,
          catalog_products.fulfillment_mode,
          catalog_products.created_at,
          catalog_products.popularity,
          catalog_products.image,
          catalog_products.image_alt,
          catalog_products.meta,
          catalog_products.keywords,
          catalog_products.details,
          supplier_listings.price_microusd::text AS supplier_price_microusd
        FROM catalog_products
        LEFT JOIN supplier_listings
          ON catalog_products.supplier_provider = 'sih'
          AND supplier_listings.supplier = 'sih'
          AND supplier_listings.game = lower(catalog_products.game)
          AND supplier_listings.market_hash_name = catalog_products.supplier_item_id
          AND supplier_listings.active = true
        WHERE catalog_products.public_enabled = true
          AND catalog_products.kind IN ('skins', 'steam')
        ORDER BY catalog_products.popularity DESC, catalog_products.created_at DESC, catalog_products.id ASC
      `,
    );
    return Promise.all(result.rows.map(async (row) => {
      const livePrice = row.supplier_price_microusd === null
        ? undefined
        : await this.pricing.quoteSupplierPrice({
          scope: "sih-skins",
          supplierAmountMicrounit: BigInt(row.supplier_price_microusd),
        });
      return {
        id: row.id,
        slug: row.slug,
        kind: row.kind,
        category: row.category,
        ...(row.game === null ? {} : { game: row.game }),
        productType: row.product_type,
        title: row.title,
        description: row.description,
        priceCoins: Math.floor(row.price_coin_minor / 100),
        ...(livePrice === undefined ? {} : { priceCoinMinor: livePrice.amountMinor }),
        availability: row.availability,
        fulfillmentMode: row.fulfillment_mode,
        createdAt: row.created_at.toISOString(),
        popularity: row.popularity,
        ...(row.image === null ? {} : { image: row.image }),
        ...(row.image_alt === null ? {} : { imageAlt: row.image_alt }),
        meta: row.meta,
        keywords: row.keywords,
        details: row.details,
      };
    }));
  }
}
