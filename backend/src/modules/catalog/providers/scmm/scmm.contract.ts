import { createHash } from "node:crypto";

import { normalizeCatalogDescription } from "../../catalog-description";
import type { CatalogMetadataItemInput } from "../../catalog-metadata.types";
import type { CatalogMetadataProviderResult } from "../metadata/catalog-metadata-provider";

export const SCMM_SOURCE_URL = "https://rust.scmm.app/api/item";

const maxSourceItems = 100_000;
const maxSignedInt64 = 9_223_372_036_854_775_807n;
const canonicalDecimal = /^(?:0|[1-9][0-9]*)$/;

type ScmmSourceItem = {
  appId: string;
  baseTypeKey: string | null;
  categoryName: string;
  description: string | null;
  imageUrl: string | null;
  marketHashName: string | null;
  name: string | null;
  normalizedTags: Readonly<Record<string, string>>;
  providerItemId: string;
  typeName: string | null;
  workshopFileId: string | null;
  raw: Record<string, unknown>;
};

export type ScmmPage = {
  count: number;
  items: readonly ScmmSourceItem[];
  start: number;
  total: number;
};

export type ScmmPageExpectation = {
  expectedTotal?: number;
  pageSize: number;
  requestedStart: number;
};

function invalid(code: string): never {
  throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength || value.trim() !== value) {
    invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  }
  return value;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  return canonicalText(value, maximumLength);
}

function decimalString(value: unknown): string {
  let normalized: string;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
    normalized = String(value);
  } else if (typeof value === "string" && canonicalDecimal.test(value)) {
    normalized = value;
  } else {
    invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  }
  try {
    if (BigInt(normalized) > maxSignedInt64) invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  } catch {
    invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  }
  return normalized;
}

function optionalDecimalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = decimalString(value);
  return normalized === "0" ? null : normalized;
}

function safePaginationInteger(value: unknown): number {
  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && canonicalDecimal.test(value)) {
    parsed = Number(value);
  } else {
    invalid("CATALOG_METADATA_SCMM_PAGE_INVALID");
  }
  if (!Number.isSafeInteger(parsed)) invalid("CATALOG_METADATA_SCMM_PAGE_INVALID");
  return parsed;
}

function optionalHttpsUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = canonicalText(value, 2_048);
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  } catch {
    invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  }
  return normalized;
}

function selectedTags(value: unknown): { category: string | null; normalizedTags: Readonly<Record<string, string>> } {
  if (value === undefined || value === null) return { category: null, normalizedTags: Object.freeze({}) };
  if (!isRecord(value)) invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  const category = optionalText(value.scmmcat, 256) ?? optionalText(value.steamcat, 256);
  return { category, normalizedTags: Object.freeze({}) };
}

function mapScmmItem(value: unknown): ScmmSourceItem {
  if (!isRecord(value)) invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  const appId = decimalString(value.appId);
  if (appId !== "252490") invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  const providerItemId = decimalString(value.id);
  const marketHashName = optionalText(value.nameHash, 512);
  const name = optionalText(value.name, 1_024);
  if (marketHashName !== null && name === null) invalid("CATALOG_METADATA_SCMM_ITEM_INVALID");
  const typeName = optionalText(value.itemType, 256);
  const selected = selectedTags(value.tags);
  const normalizedTags: Record<string, string> = {};
  if (selected.category !== null) normalizedTags.category = selected.category;
  if (typeName !== null) normalizedTags.item_type = typeName;
  return Object.freeze({
    appId,
    baseTypeKey: optionalText(value.itemShortName, 256),
    categoryName: selected.category ?? typeName ?? "Other",
    description: normalizeCatalogDescription(optionalText(value.description, 65_536)),
    imageUrl: optionalHttpsUrl(value.iconLargeUrl) ?? optionalHttpsUrl(value.iconUrl),
    marketHashName,
    name,
    normalizedTags,
    providerItemId,
    typeName,
    workshopFileId: optionalDecimalString(value.workshopFileId),
    raw: value,
  });
}

export function parseScmmPage(document: unknown, expectation: ScmmPageExpectation): ScmmPage {
  if (
    !Number.isSafeInteger(expectation.requestedStart) ||
    expectation.requestedStart < 0 ||
    !Number.isSafeInteger(expectation.pageSize) ||
    expectation.pageSize < 1 ||
    expectation.pageSize > 1_000 ||
    (expectation.expectedTotal !== undefined && (!Number.isSafeInteger(expectation.expectedTotal) || expectation.expectedTotal < 1 || expectation.expectedTotal > maxSourceItems)) ||
    !isRecord(document) ||
    !Array.isArray(document.items)
  ) {
    invalid("CATALOG_METADATA_SCMM_PAGE_INVALID");
  }
  const start = safePaginationInteger(document.start);
  const count = safePaginationInteger(document.count);
  const total = safePaginationInteger(document.total);
  const expectedCount = Math.min(expectation.pageSize, total - expectation.requestedStart);
  if (
    start !== expectation.requestedStart ||
    total < 1 ||
    total > maxSourceItems ||
    expectation.requestedStart >= total ||
    (expectation.expectedTotal !== undefined && total !== expectation.expectedTotal) ||
    expectedCount < 1 ||
    count !== expectedCount ||
    document.items.length !== count
  ) {
    invalid("CATALOG_METADATA_SCMM_PAGE_INVALID");
  }
  return Object.freeze({
    count,
    items: Object.freeze(document.items.map(mapScmmItem)),
    start,
    total,
  });
}

function toMetadataItem(item: ScmmSourceItem & { marketHashName: string; name: string }): CatalogMetadataItemInput {
  return {
    provider: "scmm",
    game: "rust",
    locale: "en",
    marketHashName: item.marketHashName,
    providerItemId: item.providerItemId,
    title: item.name,
    description: item.description,
    categoryName: item.categoryName,
    productType: item.typeName ?? item.categoryName,
    rarityName: null,
    imageUrl: item.imageUrl,
    tags: [...new Set([item.categoryName, item.typeName].filter((value): value is string => value !== null && value !== ""))],
    raw: item.raw,
  };
}

function canonicalHashRow(item: ScmmSourceItem): string {
  return JSON.stringify({
    appId: item.appId,
    categoryName: item.categoryName,
    description: item.description,
    imageUrl: item.imageUrl,
    marketHashName: item.marketHashName,
    name: item.name,
    providerItemId: item.providerItemId,
    typeName: item.typeName,
  });
}

export function createScmmSnapshot(
  pages: readonly ScmmPage[],
  targetMarketHashNames: ReadonlySet<string>,
  observedAt: Date,
): CatalogMetadataProviderResult {
  if (pages.length === 0 || !(targetMarketHashNames instanceof Set) || !Number.isFinite(observedAt.getTime())) {
    invalid("CATALOG_METADATA_SCMM_SNAPSHOT_INVALID");
  }
  const sortedPages = [...pages].sort((left, right) => left.start - right.start);
  const total = sortedPages[0]?.total;
  let nextStart = 0;
  for (const page of sortedPages) {
    if (page.total !== total || page.start !== nextStart || page.count !== page.items.length) {
      invalid("CATALOG_METADATA_SCMM_PAGINATION_INVALID");
    }
    nextStart += page.count;
  }
  if (total === undefined || nextStart !== total) invalid("CATALOG_METADATA_SCMM_PAGINATION_INVALID");
  const sourceItems = sortedPages.flatMap((page) => page.items);
  const sourceHash = createHash("sha256");
  for (const row of sourceItems.map(canonicalHashRow).sort()) sourceHash.update(row).update("\n");
  const items = sourceItems
    .filter((item): item is ScmmSourceItem & { marketHashName: string; name: string } =>
      item.marketHashName !== null && item.name !== null && item.providerItemId !== "0" && targetMarketHashNames.has(item.marketHashName),
    )
    .sort((left, right) => left.marketHashName.localeCompare(right.marketHashName))
    .map(toMetadataItem);
  return {
    provider: "scmm",
    game: "rust",
    locale: "en",
    sourceUrl: SCMM_SOURCE_URL,
    sourceHash: sourceHash.digest("hex"),
    observedAt,
    sourceItemCount: total,
    filteredOutCount: total - items.length,
    collapsedDuplicateCount: 0,
    metadata: {},
    items,
  };
}
