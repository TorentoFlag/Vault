import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import type { SihCatalogGame, SihSupplierItem } from "../providers/sih/sih.types";

export type SihCatalogClient = {
  getItems(command: { game: SihCatalogGame }): Promise<SihSupplierItem[]>;
};

export type CatalogSupplierSyncResult = {
  game: SihCatalogGame;
  runId: string;
  rowCount: number;
  source: "sih";
  status: "promoted";
};

export type SyncSihGameCommand = {
  client: SihCatalogClient;
  game: SihCatalogGame;
  observedAt?: Date;
};

function assertObservedAt(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error("CATALOG_SYNC_OBSERVED_AT_INVALID");
  return value;
}

function snapshot(item: SihSupplierItem): Record<string, unknown> {
  return {
    availableQuantity: item.availableQuantity,
    game: item.game,
    imageUrl: item.imageUrl,
    marketHashName: item.marketHashName,
    priceMicrousd: item.priceMicrousd.toString(),
  };
}

@Injectable()
export class CatalogSupplierSyncService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async syncSihGame(command: SyncSihGameCommand): Promise<CatalogSupplierSyncResult> {
    const observedAt = assertObservedAt(command.observedAt ?? new Date());
    const items = await command.client.getItems({ game: command.game });
    if (items.some((item) => item.game !== command.game)) throw new Error("CATALOG_SYNC_GAME_MISMATCH");

    return this.database.transaction(async (tx) => {
      const run = await tx.query<{ id: string }>(
        `
          INSERT INTO catalog_sync_runs (
            source,
            game,
            status,
            observed_at,
            finished_at,
            row_count
          )
          VALUES ('sih', $1, 'promoted', $2, clock_timestamp(), $3)
          RETURNING id
        `,
        [command.game, observedAt, items.length],
      );
      const runId = run.rows[0]?.id;
      if (runId === undefined) throw new Error("CATALOG_SYNC_RUN_NOT_STORED");

      for (const item of items) {
        await tx.query(
          `
            INSERT INTO supplier_listings (
              supplier,
              game,
              market_hash_name,
              active,
              available_quantity,
              price_microusd,
              image_url,
              snapshot,
              first_seen_at,
              last_seen_at,
              last_sync_run_id
            )
            VALUES ('sih', $1, $2, true, $3, $4, $5, $6, $7, $7, $8)
            ON CONFLICT (supplier, game, market_hash_name) DO UPDATE
            SET active = true,
                available_quantity = EXCLUDED.available_quantity,
                price_microusd = EXCLUDED.price_microusd,
                image_url = EXCLUDED.image_url,
                snapshot = EXCLUDED.snapshot,
                last_seen_at = EXCLUDED.last_seen_at,
                last_sync_run_id = EXCLUDED.last_sync_run_id
          `,
          [
            item.game,
            item.marketHashName,
            item.availableQuantity,
            item.priceMicrousd.toString(),
            item.imageUrl,
            snapshot(item),
            observedAt,
            runId,
          ],
        );
      }

      await tx.query(
        `
          UPDATE supplier_listings
          SET active = false,
              last_sync_run_id = $1
          WHERE supplier = 'sih'
            AND game = $2
            AND last_sync_run_id <> $1
            AND active = true
        `,
        [runId, command.game],
      );

      return {
        game: command.game,
        runId,
        rowCount: items.length,
        source: "sih",
        status: "promoted",
      };
    });
  }
}
