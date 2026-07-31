import { CsgoApiClient } from "./modules/catalog/providers/csgo-api/csgo-api.client";
import { CatalogMetadataProviderRegistry } from "./modules/catalog/providers/metadata/catalog-metadata-provider.registry";
import { ScmmClient } from "./modules/catalog/providers/scmm/scmm.client";
import { Tf2AutobotClient } from "./modules/catalog/providers/tf2-autobot/tf2-autobot.client";

export function createCatalogMetadataProviderRegistry(): CatalogMetadataProviderRegistry {
  return new CatalogMetadataProviderRegistry([
    new CsgoApiClient({
      maximumBodyBytes: 100 * 1024 * 1024,
      requestTimeoutMs: 60_000,
    }),
    new ScmmClient({
      maximumBodyBytesPerPage: 16 * 1024 * 1024,
      pageConcurrency: 2,
      pageSize: 500,
      requestTimeoutMs: 60_000,
    }),
    new Tf2AutobotClient({
      concurrency: 4,
      maximumBodyBytes: 256 * 1024,
      requestTimeoutMs: 10_000,
      runTimeoutMs: 295_000,
    }),
  ]);
}
