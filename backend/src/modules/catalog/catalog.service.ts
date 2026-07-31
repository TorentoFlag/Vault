import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { CatalogPricingService } from "./catalog-pricing.service";
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
const defaultCatalogLimit = 120;
const maxCatalogLimit = 240;
const relatedTerms: Record<CatalogProductKind, string[]> = {
  steam: ["steam", "стим", "пополнение", "баланс", "кошелек"],
  skins: ["скин", "скины", "предмет", "предметы", "cs2"],
};

type LoadedCatalogProduct = CatalogProduct & {
  priceCoinMinor?: number;
  supplierPriceMicrousd?: string;
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

function limitQuery(value: string | undefined): number {
  const parsed = numberQuery(value);
  if (parsed === undefined) return defaultCatalogLimit;
  if (!Number.isSafeInteger(parsed) || parsed < 1) return defaultCatalogLimit;
  return Math.min(parsed, maxCatalogLimit);
}

function offsetQuery(value: string | undefined): number {
  const parsed = numberQuery(value);
  if (parsed === undefined || !Number.isSafeInteger(parsed)) return 0;
  return Math.max(0, parsed);
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
  const exactGame = ["cs2"].find((game) => game === normalizedQuery);
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
    const limit = limitQuery(query.limit);
    const offset = offsetQuery(query.offset);
    const [products, catalogFacets, total] = await Promise.all([
      this.loadProducts({
        ...(category === undefined ? {} : { category }),
        search,
        limit,
        offset,
        sort,
      }),
      this.loadFacets(),
      this.countProducts({
        ...(category === undefined ? {} : { category }),
        search,
      }),
    ]);

    const items = products
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
      })
      .slice(0, limit);

    const quotedItems = await Promise.all(items.map((product) => this.withLivePrice(product)));

    return {
      items: quotedItems.map(productDto),
      facets: catalogFacets,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + items.length < total,
      },
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
    const product = (await this.loadProducts({ slug, limit: 1 }))[0];
    if (!product) throw new NotFoundException("Product not found");
    return productDto(await this.withLivePrice(product));
  }

  private async withLivePrice(product: LoadedCatalogProduct): Promise<LoadedCatalogProduct> {
    if (product.supplierPriceMicrousd === undefined) return product;
    const livePrice = await this.pricing.quoteSupplierPrice({
      scope: "sih-skins",
      supplierAmountMicrounit: BigInt(product.supplierPriceMicrousd),
    });
    return { ...product, priceCoinMinor: livePrice.amountMinor };
  }

  private async loadProducts(command: {
    category?: CatalogProductKind;
    limit?: number;
    offset?: number;
    search?: string;
    slug?: string;
    sort?: CatalogSort;
  } = {}): Promise<LoadedCatalogProduct[]> {
    const { params, where } = this.catalogWhere(command);
    const limit = Math.min(command.limit ?? maxCatalogLimit, maxCatalogLimit * 4);
    params.push(limit);
    const limitParam = params.length;
    const offset = Math.max(0, command.offset ?? 0);
    params.push(offset);
    const offsetParam = params.length;
    const orderBy = command.sort === "newest"
      ? "catalog_products.created_at DESC, catalog_products.popularity DESC, catalog_products.id ASC"
      : "catalog_products.popularity DESC, catalog_products.created_at DESC, catalog_products.id ASC";
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
        WHERE ${where.join("\n          AND ")}
        ORDER BY ${orderBy}
        LIMIT $${limitParam}
        OFFSET $${offsetParam}
      `,
      params,
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
      ...(row.supplier_price_microusd === null ? {} : { supplierPriceMicrousd: row.supplier_price_microusd }),
    }));
  }

  private catalogWhere(command: {
    category?: CatalogProductKind;
    search?: string;
    slug?: string;
  }) {
    const params: Array<number | string> = [];
    const where = [
      "catalog_products.public_enabled = true",
      "catalog_products.kind IN ('skins', 'steam')",
    ];
    if (command.category !== undefined) {
      params.push(command.category);
      where.push(`catalog_products.kind = $${params.length}`);
    }
    if (command.slug !== undefined) {
      params.push(command.slug);
      where.push(`catalog_products.slug = $${params.length}`);
    }
    const search = normalize(command.search ?? "");
    if (search) {
      const exactGame = ["cs2"].find((game) => game === search);
      if (exactGame !== undefined) {
        params.push(exactGame);
        where.push(`lower(coalesce(catalog_products.game, '')) = $${params.length}`);
      } else {
        for (const term of search.split(/\s+/).filter(Boolean)) {
          if (term === "steam") {
            where.push("catalog_products.kind = 'steam'");
            continue;
          }
          if (["скин", "скины", "предмет", "предметы"].includes(term)) {
            where.push("catalog_products.kind = 'skins'");
            continue;
          }
          params.push(`%${term}%`);
          where.push(`(
            lower(catalog_products.title) LIKE $${params.length}
            OR lower(catalog_products.description) LIKE $${params.length}
            OR lower(catalog_products.category) LIKE $${params.length}
            OR lower(coalesce(catalog_products.game, '')) LIKE $${params.length}
            OR lower(catalog_products.product_type) LIKE $${params.length}
            OR lower(array_to_string(catalog_products.meta || catalog_products.keywords, ' ')) LIKE $${params.length}
          )`);
        }
      }
    }
    return { params, where };
  }

  private async countProducts(command: {
    category?: CatalogProductKind;
    search?: string;
    slug?: string;
  }): Promise<number> {
    const { params, where } = this.catalogWhere(command);
    const result = await this.database.query<{ total: string }>(
      `
        SELECT count(*)::text AS total
        FROM catalog_products
        WHERE ${where.join("\n          AND ")}
      `,
      params,
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  private async loadFacets(): Promise<CatalogFacetsDto> {
    const result = await this.database.query<{
      game: string | null;
      product_type: string | null;
    }>(
      `
        SELECT DISTINCT game, product_type
        FROM catalog_products
        WHERE public_enabled = true
          AND kind IN ('skins', 'steam')
        ORDER BY game ASC, product_type ASC
      `,
    );
    const facetRows = result.rows.map((row) => ({
      id: "facet",
      slug: "facet",
      kind: "skins" as const,
      category: "",
      ...(row.game === null ? {} : { game: row.game }),
      productType: row.product_type ?? "",
      title: "",
      description: "",
      priceCoins: 0,
      availability: "available" as const,
      fulfillmentMode: "steam-trade" as const,
      createdAt: new Date(0).toISOString(),
      popularity: 0,
      meta: [],
      keywords: [],
      details: { specifications: [], fulfillment: { title: "", description: "", requirements: [] } },
    }));
    return facets(facetRows);
  }
}
