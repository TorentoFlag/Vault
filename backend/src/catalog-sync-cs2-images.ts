import "reflect-metadata";

import { createHash } from "node:crypto";

import { NestFactory } from "@nestjs/core";

import { DatabaseService } from "./common/database/database.service";
import { AppModule } from "./app.module";

const CSGO_API_COMMIT = "5e01f938a115de71a5be644c5b198d93abc6a3cf";
const CSGO_API_SOURCE_URL = `https://raw.githubusercontent.com/TorentoFlag/CSGO-API/${CSGO_API_COMMIT}/public/api/ru/all.json`;
const MAX_CSGO_API_BODY_BYTES = 100 * 1024 * 1024;
const PUBLIC_IMAGE_HOSTS = new Set([
  "cdn.cloudflare.steamstatic.com",
  "community.akamai.steamstatic.com",
  "community.cloudflare.steamstatic.com",
  "raw.githubusercontent.com",
  "steamcommunity-a.akamaihd.net",
]);

export type Cs2MetadataImage = {
  imageUrl: string;
  marketHashName: string;
};

type SyncCs2ImagesResult = {
  activeSihListingCount: number;
  blockedProductImageCount: number;
  blockedSupplierImageCount: number;
  matchedActiveCount: number;
  productUpdatedCount: number;
  sourceContentHash: string;
  sourceItemCount: number;
  sourceUrl: string;
  supplierUpdatedCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !PUBLIC_IMAGE_HOSTS.has(url.hostname) ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseCs2MetadataImages(rawPayload: string): Cs2MetadataImage[] {
  const payload = JSON.parse(rawPayload) as unknown;
  if (!isRecord(payload)) throw new Error("CS2_METADATA_IMAGE_SOURCE_INVALID");

  const byMarketHashName = new Map<string, string>();
  for (const item of Object.values(payload)) {
    if (!isRecord(item)) continue;
    const marketHashName = item.market_hash_name;
    if (typeof marketHashName !== "string" || marketHashName.length === 0 || marketHashName.length > 512 || marketHashName.trim() !== marketHashName) continue;
    const imageUrl = publicImageUrl(item.image);
    if (imageUrl === null) continue;
    if (!byMarketHashName.has(marketHashName)) byMarketHashName.set(marketHashName, imageUrl);
  }

  return [...byMarketHashName.entries()]
    .map(([marketHashName, imageUrl]) => ({ imageUrl, marketHashName }))
    .sort((left, right) => left.marketHashName.localeCompare(right.marketHashName));
}

async function fetchCs2MetadataImages(): Promise<{ contentHash: string; images: Cs2MetadataImage[]; sourceUrl: string }> {
  const response = await fetch(CSGO_API_SOURCE_URL, {
    headers: { accept: "application/json,text/plain" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("CS2_METADATA_IMAGE_SOURCE_UNAVAILABLE");
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && BigInt(declaredLength) > BigInt(MAX_CSGO_API_BODY_BYTES)) {
    throw new Error("CS2_METADATA_IMAGE_SOURCE_TOO_LARGE");
  }
  const rawPayload = await response.text();
  if (Buffer.byteLength(rawPayload, "utf8") > MAX_CSGO_API_BODY_BYTES) {
    throw new Error("CS2_METADATA_IMAGE_SOURCE_TOO_LARGE");
  }
  return {
    contentHash: createHash("sha256").update(rawPayload).digest("hex"),
    images: parseCs2MetadataImages(rawPayload),
    sourceUrl: CSGO_API_SOURCE_URL,
  };
}

async function syncCs2Images(database: DatabaseService, images: readonly Cs2MetadataImage[], sourceContentHash: string): Promise<SyncCs2ImagesResult> {
  const active = await database.query<{ market_hash_name: string }>(
    `
      SELECT market_hash_name
      FROM supplier_listings
      WHERE supplier = 'sih'
        AND game = 'cs2'
        AND active = true
    `,
  );
  const activeNames = new Set(active.rows.map((row) => row.market_hash_name));
  const matched = images.filter((image) => activeNames.has(image.marketHashName));
  if (matched.length === 0) throw new Error("CS2_METADATA_IMAGE_MATCH_EMPTY");

  const result = await database.transaction(async (tx) => {
    await tx.query(`
      CREATE TEMP TABLE tmp_cs2_metadata_images (
        market_hash_name text PRIMARY KEY,
        image_url text NOT NULL
      ) ON COMMIT DROP
    `);

    const batchSize = 2_000;
    for (let offset = 0; offset < matched.length; offset += batchSize) {
      const batch = matched.slice(offset, offset + batchSize);
      await tx.query(
        `
          INSERT INTO tmp_cs2_metadata_images (market_hash_name, image_url)
          SELECT market_hash_name, image_url
          FROM jsonb_to_recordset($1::jsonb) AS item(market_hash_name text, image_url text)
          ON CONFLICT (market_hash_name) DO UPDATE
          SET image_url = EXCLUDED.image_url
        `,
        [JSON.stringify(batch.map((item) => ({ image_url: item.imageUrl, market_hash_name: item.marketHashName })))],
      );
    }

    const supplier = await tx.query(`
      UPDATE supplier_listings
      SET image_url = tmp_cs2_metadata_images.image_url
      FROM tmp_cs2_metadata_images
      WHERE supplier_listings.supplier = 'sih'
        AND supplier_listings.game = 'cs2'
        AND supplier_listings.market_hash_name = tmp_cs2_metadata_images.market_hash_name
        AND supplier_listings.image_url IS DISTINCT FROM tmp_cs2_metadata_images.image_url
    `);
    const products = await tx.query(`
      UPDATE catalog_products
      SET image = tmp_cs2_metadata_images.image_url,
          public_enabled = true,
          updated_at = clock_timestamp()
      FROM tmp_cs2_metadata_images
      WHERE catalog_products.supplier_provider = 'sih'
        AND catalog_products.kind = 'skins'
        AND lower(catalog_products.game) = 'cs2'
        AND catalog_products.supplier_item_id = tmp_cs2_metadata_images.market_hash_name
        AND catalog_products.image IS DISTINCT FROM tmp_cs2_metadata_images.image_url
    `);
    const blockedSupplier = await tx.query(`
      UPDATE supplier_listings
      SET image_url = NULL
      WHERE supplier = 'sih'
        AND game = 'cs2'
        AND image_url LIKE 'https://steaminventoryhelper.com/%'
    `);
    const blockedProducts = await tx.query(`
      UPDATE catalog_products
      SET image = NULL,
          public_enabled = false,
          updated_at = clock_timestamp()
      WHERE supplier_provider = 'sih'
        AND kind = 'skins'
        AND image LIKE 'https://steaminventoryhelper.com/%'
    `);
    await tx.query(`
      UPDATE catalog_products
      SET public_enabled = false,
          updated_at = clock_timestamp()
      WHERE supplier_provider = 'sih'
        AND kind = 'skins'
        AND image IS NULL
        AND public_enabled = true
    `);

    return {
      blockedProductImageCount: blockedProducts.rowCount ?? 0,
      blockedSupplierImageCount: blockedSupplier.rowCount ?? 0,
      productUpdatedCount: products.rowCount ?? 0,
      supplierUpdatedCount: supplier.rowCount ?? 0,
    };
  });

  return {
    activeSihListingCount: active.rows.length,
    blockedProductImageCount: result.blockedProductImageCount,
    blockedSupplierImageCount: result.blockedSupplierImageCount,
    matchedActiveCount: matched.length,
    productUpdatedCount: result.productUpdatedCount,
    sourceContentHash,
    sourceItemCount: images.length,
    sourceUrl: CSGO_API_SOURCE_URL,
    supplierUpdatedCount: result.supplierUpdatedCount,
  };
}

async function main(): Promise<void> {
  const source = await fetchCs2MetadataImages();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try {
    const database = app.get(DatabaseService);
    const result = await syncCs2Images(database, source.images, source.contentHash);
    process.stdout.write(JSON.stringify({ ...result, status: "ok" }));
    process.stdout.write("\n");
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "CS2_METADATA_IMAGE_SYNC_FAILED";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
