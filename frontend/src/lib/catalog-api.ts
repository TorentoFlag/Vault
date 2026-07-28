import type { Product, ProductAvailability, ProductDetails, ProductFulfillmentMode } from "../types/commerce.ts";

import { serializeCatalogFilters, type CatalogFilters } from "./catalog.ts";

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiCoinPrice = {
  currency: "COINS";
  amountMinor: number;
  scale: 2;
  display: string;
};

type ApiCatalogProduct = {
  id: string;
  slug: string;
  kind: "steam" | "skins";
  category: string;
  game?: string;
  productType: string;
  title: string;
  description: string;
  price: ApiCoinPrice;
  availability: ProductAvailability;
  fulfillmentMode: ProductFulfillmentMode;
  createdAt: string;
  popularity: number;
  image?: string;
  imageAlt?: string;
  meta: string[];
  keywords: string[];
  details: ProductDetails;
};

export type CatalogApiList = {
  items: Product[];
};

export type CatalogFetchOptions = {
  baseUrl?: string;
  fetch?: ApiFetch;
  filters?: CatalogFilters;
};

export type CatalogProductFetchOptions = {
  baseUrl?: string;
  fetch?: ApiFetch;
};

function defaultApiBaseUrl() {
  return process.env.VAULT_API_BASE_URL
    ?? process.env.NEXT_PUBLIC_API_BASE_URL
    ?? (typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
}

function buildApiUrl(path: string, baseUrl?: string) {
  const base = new URL(baseUrl ?? defaultApiBaseUrl());
  return new URL(path, base.origin);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCoinPrice(value: unknown): value is ApiCoinPrice {
  if (!isRecord(value)) return false;
  const amountMinor = value.amountMinor;
  return (
    value.currency === "COINS"
    && Number.isSafeInteger(amountMinor)
    && typeof amountMinor === "number"
    && amountMinor > 0
    && value.scale === 2
    && typeof value.display === "string"
  );
}

function isProductDetails(value: unknown): value is ProductDetails {
  if (!isRecord(value) || !Array.isArray(value.specifications) || !isRecord(value.fulfillment)) return false;
  return (
    value.specifications.every((item) => (
      isRecord(item) && typeof item.label === "string" && typeof item.value === "string"
    ))
    && typeof value.fulfillment.title === "string"
    && typeof value.fulfillment.description === "string"
    && isStringArray(value.fulfillment.requirements)
  );
}

function isApiCatalogProduct(value: unknown): value is ApiCatalogProduct {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string"
    && typeof value.slug === "string"
    && (value.kind === "steam" || value.kind === "skins")
    && typeof value.category === "string"
    && (value.game === undefined || typeof value.game === "string")
    && typeof value.productType === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && isCoinPrice(value.price)
    && (value.availability === "available" || value.availability === "on-request")
    && (value.fulfillmentMode === "automatic" || value.fulfillmentMode === "steam-trade" || value.fulfillmentMode === "manual")
    && typeof value.createdAt === "string"
    && Number.isSafeInteger(value.popularity)
    && (value.image === undefined || typeof value.image === "string")
    && (value.imageAlt === undefined || typeof value.imageAlt === "string")
    && isStringArray(value.meta)
    && isStringArray(value.keywords)
    && isProductDetails(value.details)
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json() as Promise<unknown>;
}

async function requestJson(url: URL, fetchImpl: ApiFetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    credentials: "include",
    cache: "no-store",
  });
  const body = await parseJson(response);
  if (!response.ok) {
    throw new Error(`Catalog API request failed with status ${response.status}.`);
  }
  return body;
}

export function mapApiCatalogProduct(product: unknown): Product {
  if (!isApiCatalogProduct(product)) {
    throw new Error("Catalog product response is malformed.");
  }

  return {
    id: product.id,
    slug: product.slug,
    kind: product.kind,
    category: product.category,
    ...(product.game === undefined ? {} : { game: product.game }),
    productType: product.productType,
    title: product.title,
    description: product.description,
    priceCoins: product.price.amountMinor / 100,
    availability: product.availability,
    fulfillmentMode: product.fulfillmentMode,
    createdAt: product.createdAt,
    popularity: product.popularity,
    ...(product.image === undefined ? {} : { image: product.image }),
    ...(product.imageAlt === undefined ? {} : { imageAlt: product.imageAlt }),
    meta: product.meta,
    keywords: product.keywords,
    details: product.details,
  };
}

export async function fetchCatalogList(options: CatalogFetchOptions = {}): Promise<CatalogApiList> {
  const url = buildApiUrl("/catalog", options.baseUrl);
  if (options.filters) {
    const serialized = serializeCatalogFilters(options.filters);
    serialized.forEach((value, key) => url.searchParams.append(key, value));
  }
  const body = await requestJson(url, options.fetch ?? fetch);
  if (!isRecord(body) || !Array.isArray(body.items)) throw new Error("Catalog response is malformed.");
  return { items: body.items.map(mapApiCatalogProduct) };
}

export async function fetchCatalogProductBySlug(slug: string, options: CatalogProductFetchOptions = {}): Promise<Product | null> {
  if (!slug.trim()) return null;
  const url = buildApiUrl(`/catalog/${encodeURIComponent(slug)}`, options.baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(url, {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 404) return null;
  const body = await parseJson(response);
  if (!response.ok) throw new Error(`Catalog product API request failed with status ${response.status}.`);
  return mapApiCatalogProduct(body);
}
