import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import { parseAppleGiftCardDetails, type AppleGiftCardDetails } from "../catalog/apple-gift-card";

const APPLE_CATEGORY_ID = "apple_gift_card";
const APPLE_CATEGORY = {
  id: APPLE_CATEGORY_ID,
  revision: APPLE_CATEGORY_ID,
  parentId: null,
  name: "Подарочные карты Apple",
  slug: "apple-gift-cards",
  image: null,
  sortOrder: 0,
  isActive: true,
};

type ProductInput = {
  readonly categoryId?: unknown;
  readonly title?: unknown;
  readonly slug?: unknown;
  readonly description?: unknown;
  readonly media?: unknown;
  readonly sortOrder?: unknown;
  readonly isActive?: unknown;
  readonly attributes?: unknown;
};

type OfferInput = {
  readonly productId?: unknown;
  readonly price?: unknown;
  readonly availability?: unknown;
  readonly isActive?: unknown;
};

type CatalogProductRow = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly price_coin_minor: number;
  readonly availability: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly public_enabled: boolean;
  readonly popularity: number;
  readonly image: string | null;
  readonly image_alt: string | null;
  readonly meta: string[];
  readonly keywords: string[];
  readonly details: unknown;
};

@Injectable()
export class CatalogProtocolService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  listCategories() {
    return { items: [APPLE_CATEGORY], nextCursor: null };
  }

  async listProducts() {
    const rows = await this.appleRows();
    return {
      items: rows.map(productResource),
      nextCursor: null,
    };
  }

  async listOffers(productId?: string | null) {
    const rows = await this.appleRows(productId ?? undefined);
    return {
      items: rows.map(offerResource),
      nextCursor: null,
    };
  }

  async createProduct(input: ProductInput) {
    const normalized = normalizeProductInput(input);
    await this.database.query(
      `
        INSERT INTO catalog_products (
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
          popularity,
          image,
          image_alt,
          meta,
          keywords,
          details,
          supplier_provider,
          supplier_snapshot,
          public_enabled
        )
        VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, 'available', 'manual', $9, $10, $11, $12, $13, $14::jsonb, NULL, '{}'::jsonb, $15)
      `,
      [
        normalized.id,
        normalized.slug,
        "apple_gift_card",
        "Подарочная карта Apple",
        "Подарочная карта App Store & iTunes",
        normalized.title,
        normalized.description,
        normalized.priceCoinMinor,
        normalized.sortOrder,
        normalized.image?.url ?? null,
        localizedText(normalized.image?.alt) ?? null,
        normalized.meta,
        normalized.keywords,
        JSON.stringify(normalized.details),
        normalized.isActive,
      ],
    );
    const row = await this.requireAppleRow(normalized.id);
    return productResource(row);
  }

  async updateProduct(id: string, input: ProductInput, revision?: string) {
    const existing = await this.requireAppleRow(id);
    assertRevision(existing, revision);
    const normalized = normalizeProductInput(input, id);
    await this.database.query(
      `
        UPDATE catalog_products
        SET
          slug = $2,
          title = $3,
          description = $4,
          image = $5,
          image_alt = $6,
          meta = $7,
          keywords = $8,
          details = $9::jsonb,
          public_enabled = $10,
          popularity = $11,
          updated_at = now()
        WHERE id = $1
          AND kind = 'apple_gift_card'
      `,
      [
        id,
        normalized.slug,
        normalized.title,
        normalized.description,
        normalized.image?.url ?? null,
        localizedText(normalized.image?.alt) ?? null,
        normalized.meta,
        normalized.keywords,
        JSON.stringify(normalized.details),
        normalized.isActive,
        normalized.sortOrder,
      ],
    );
    return productResource(await this.requireAppleRow(id));
  }

  async deleteProduct(id: string, dryRun: boolean, revision?: string) {
    const existing = await this.requireAppleRow(id);
    assertRevision(existing, revision);
    const references = await this.referenceCount(id);
    if (references > 0) {
      return {
        id,
        revision: revisionOf(existing),
        permitted: false,
        reason: "Сначала обработайте или удалите связанные заказы.",
        relatedTechnicalOrders: references,
      };
    }
    if (dryRun) {
      return {
        id,
        revision: revisionOf(existing),
        permitted: true,
        relatedTechnicalOrders: 0,
      };
    }
    await this.database.query(
      "DELETE FROM catalog_products WHERE id = $1 AND kind = 'apple_gift_card'",
      [id],
    );
    return {
      id,
      revision: revisionOf(existing),
      deleted: true,
      permitted: true,
      relatedTechnicalOrders: 0,
    };
  }

  async createOffer(input: OfferInput) {
    const productId = readString(input.productId, "productId");
    return this.updateOffer(productId, input);
  }

  async updateOffer(id: string, input: OfferInput, revision?: string) {
    const existing = await this.requireAppleRow(id);
    assertRevision(existing, revision);
    const price = readPrice(input.price);
    const isActive = typeof input.isActive === "boolean" ? input.isActive : existing.public_enabled;
    await this.database.query(
      `
        UPDATE catalog_products
        SET
          price_coin_minor = $1,
          public_enabled = $2,
          updated_at = now()
        WHERE id = $3
          AND kind = 'apple_gift_card'
      `,
      [price.amountMinor, isActive, id],
    );
    return offerResource(await this.requireAppleRow(id));
  }

  async deleteOffer(id: string, dryRun: boolean, revision?: string) {
    const existing = await this.requireAppleRow(id);
    assertRevision(existing, revision);
    if (!dryRun) {
      await this.database.query(
        `
          UPDATE catalog_products
          SET public_enabled = false, updated_at = now()
          WHERE id = $1
            AND kind = 'apple_gift_card'
        `,
        [id],
      );
    }
    return {
      id,
      revision: revisionOf(existing),
      deleted: !dryRun,
      permitted: true,
    };
  }

  listDisabledResource() {
    return { items: [], nextCursor: null };
  }

  operationByRequest(requestId: string) {
    return {
      requestId,
      status: "in_progress",
    };
  }

  private async appleRows(productId?: string): Promise<CatalogProductRow[]> {
    const where = productId
      ? "WHERE kind = 'apple_gift_card' AND id = $1"
      : "WHERE kind = 'apple_gift_card'";
    const result = await this.database.query<CatalogProductRow>(
      `
        SELECT
          id,
          slug,
          title,
          description,
          price_coin_minor,
          availability,
          created_at,
          updated_at,
          public_enabled,
          popularity,
          image,
          image_alt,
          meta,
          keywords,
          details
        FROM catalog_products
        ${where}
        ORDER BY popularity DESC, created_at DESC, id ASC
      `,
      productId ? [productId] : [],
    );
    return result.rows;
  }

  private async requireAppleRow(id: string): Promise<CatalogProductRow> {
    const rows = await this.appleRows(id);
    const row = rows[0];
    if (row === undefined) throw new NotFoundException("Apple gift-card product not found");
    return row;
  }

  private async referenceCount(id: string): Promise<number> {
    const result = await this.database.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM order_lines WHERE product_id = $1",
      [id],
    );
    return Number(result.rows[0]?.total ?? "0");
  }
}

function productResource(row: CatalogProductRow) {
  const details = requireAppleDetails(row.details);
  return {
    id: row.id,
    revision: revisionOf(row),
    categoryId: APPLE_CATEGORY_ID,
    title: row.title,
    slug: row.slug,
    description: row.description,
    media: row.image
      ? [
          {
            id: `${row.id}-primary`,
            url: row.image,
            alt: { ru: row.image_alt ?? row.title },
          },
        ]
      : [],
    sortOrder: rowSortOrder(row),
    isActive: row.public_enabled,
    attributes: {
      currency: details.appleGiftCard.currency,
      nominalMinor: details.appleGiftCard.nominalMinor,
      regionCode: details.appleGiftCard.regionCode,
      regionLabel: details.appleGiftCard.regionLabel,
      fulfillmentTitle: details.fulfillment.title,
      fulfillmentDescription: details.fulfillment.description,
      fulfillmentRequirement: details.fulfillment.requirements[0] ?? "",
    },
  };
}

function offerResource(row: CatalogProductRow) {
  return {
    id: row.id,
    revision: revisionOf(row),
    productId: row.id,
    sellerId: null,
    price: { amountMinor: row.price_coin_minor, currency: "COINS", scale: 100 },
    availability: { quantity: row.public_enabled ? 1 : 0, unit: "code" },
    minimumQuantity: 1,
    packageQuantity: 1,
    delivery: null,
    isActive: row.public_enabled,
    attributes: { fulfillmentMode: "manual" },
  };
}

function normalizeProductInput(input: ProductInput, forcedId?: string) {
  if (input.categoryId !== APPLE_CATEGORY_ID) {
    throw new BadRequestException("Apple gift-card products must use the Apple category");
  }
  const attributes = readRecord(input.attributes, "attributes");
  const slug = readString(input.slug, "slug");
  const title = localizedText(input.title) ?? readString(input.title, "title");
  const description = localizedText(input.description) ?? readString(input.description, "description");
  const currency = readString(attributes.currency, "attributes.currency").toUpperCase();
  const nominalMinor = readPositiveInteger(attributes.nominalMinor, "attributes.nominalMinor");
  const regionCode = readString(attributes.regionCode, "attributes.regionCode").toUpperCase();
  const regionLabel = readString(attributes.regionLabel, "attributes.regionLabel");
  const fulfillmentTitle = readString(attributes.fulfillmentTitle, "attributes.fulfillmentTitle");
  const fulfillmentDescription = readString(attributes.fulfillmentDescription, "attributes.fulfillmentDescription");
  const fulfillmentRequirement = readString(attributes.fulfillmentRequirement, "attributes.fulfillmentRequirement");
  const image = firstMedia(input.media);
  const sortOrder = Number.isInteger(input.sortOrder) ? input.sortOrder as number : 0;
  const details: AppleGiftCardDetails = {
    fulfillment: {
      title: fulfillmentTitle,
      description: fulfillmentDescription,
      requirements: [fulfillmentRequirement],
    },
    appleGiftCard: {
      currency,
      nominalMinor,
      regionCode,
      regionLabel,
    },
    specifications: [
      { label: "Регион", value: regionLabel },
      { label: "Номинал", value: `${nominalMinor / 100} ${currency}` },
    ],
  };
  return {
    id: forcedId ?? slug,
    slug,
    title,
    description,
    sortOrder,
    image,
    isActive: typeof input.isActive === "boolean" ? input.isActive : true,
    priceCoinMinor: nominalMinor,
    meta: [regionLabel, `${nominalMinor / 100} ${currency}`],
    keywords: ["apple", "app store", "itunes", "подарочная карта", regionLabel, currency],
    details,
  };
}

function readPrice(value: unknown): { amountMinor: number; currency: string; scale: number } {
  const price = readRecord(value, "price");
  const amountMinor = readPositiveInteger(price.amountMinor, "price.amountMinor");
  const currency = readString(price.currency, "price.currency");
  if (currency !== "COINS") throw new BadRequestException("Apple gift-card offers are priced in Coins");
  return { amountMinor, currency, scale: 100 };
}

function assertRevision(row: CatalogProductRow, revision?: string): void {
  if (revision === undefined) return;
  const normalized = revision.replace(/^"|"$/g, "");
  if (normalized !== revisionOf(row)) {
    throw new ConflictException("Catalog revision does not match");
  }
}

function requireAppleDetails(value: unknown): AppleGiftCardDetails {
  const details = parseAppleGiftCardDetails(value);
  if (details === null) throw new BadRequestException("Apple gift-card metadata is invalid");
  return details;
}

function rowSortOrder(row: CatalogProductRow): number {
  return Number.isSafeInteger(rowSortOrderValue(row)) ? rowSortOrderValue(row) : 0;
}

function rowSortOrderValue(row: CatalogProductRow): number {
  const value = (row as unknown as { popularity?: unknown }).popularity;
  return typeof value === "number" ? value : 0;
}

function revisionOf(row: CatalogProductRow): string {
  return row.updated_at.toISOString();
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function readPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value as number;
}

function localizedText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const ru = (value as { ru?: unknown }).ru;
  return typeof ru === "string" && ru.trim() ? ru.trim() : null;
}

function firstMedia(value: unknown): { url: string; alt: unknown } | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first: unknown = value[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) return null;
  const url = (first as { url?: unknown }).url;
  if (typeof url !== "string" || !url.trim()) return null;
  return { url: url.trim(), alt: (first as { alt?: unknown }).alt };
}
