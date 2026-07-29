import { Inject, Injectable } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";
import type { CatalogProductDto } from "../catalog/catalog.types";
import type { CheckoutRecipientSnapshot } from "../checkout/checkout.service";
import { SihClient, SihProviderError } from "../providers/sih/sih.client";
import type { SihCatalogGame, SihCreateSkinOrderResult } from "../providers/sih/sih.types";
import { UsersService } from "../users/users.service";

type Queryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

export type FulfillmentOrderLineInput = {
  id: string;
  productSlug: string;
  kind: CatalogProductDto["kind"];
  title: string;
  unitPriceCoinMinor: number;
  recipientSnapshot: CheckoutRecipientSnapshot;
};

type FulfillmentCommandType = "sih_skin_purchase" | "sih_steam_refill";

type PendingSkinCommand = {
  attemptId: string;
  amountMicrousd: bigint;
  commandId: string;
  game: SihCatalogGame;
  marketHashName: string;
  orderId: string;
  orderLineId: string;
  steamId64: string;
  userId: string;
};

export type ProcessFulfillmentCommand = {
  skinTestMode: boolean;
};

export type ProcessFulfillmentResult =
  | {
    status: "none";
  }
  | {
    commandId: string;
    providerOrderId: string;
    status: "submitted";
  };

function commandTypeForLine(line: FulfillmentOrderLineInput): FulfillmentCommandType {
  if (line.kind === "skins") return "sih_skin_purchase";
  return "sih_steam_refill";
}

@Injectable()
export class FulfillmentService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SihClient) private readonly sih: SihClient,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async enqueueOrderLineCommands(
    client: Queryable,
    command: {
      orderId: string;
      lines: FulfillmentOrderLineInput[];
    },
  ): Promise<void> {
    for (const line of command.lines) {
      const commandType = commandTypeForLine(line);
      const idempotencyKey = `${command.orderId}:${line.id}:${commandType}`;
      await client.query(
        `
          INSERT INTO fulfillment_commands (
            order_id,
            order_line_id,
            provider,
            command_type,
            status,
            idempotency_key,
            payload_snapshot
          )
          VALUES ($1, $2, 'sih', $3, 'pending', $4, $5::jsonb)
          ON CONFLICT (order_line_id) DO NOTHING
        `,
        [
          command.orderId,
          line.id,
          commandType,
          idempotencyKey,
          JSON.stringify({
            orderId: command.orderId,
            orderLineId: line.id,
            productSlug: line.productSlug,
            kind: line.kind,
            title: line.title,
            unitPriceCoinMinor: line.unitPriceCoinMinor,
            recipientSnapshot: line.recipientSnapshot,
          }),
        ],
      );
    }
  }

  async processNextPendingCommand(command: ProcessFulfillmentCommand): Promise<ProcessFulfillmentResult> {
    const pending = await this.claimNextSkinCommand(command);
    if (pending === null) return { status: "none" };

    const credential = await this.users.requireSteamTradeCredential(pending.userId);
    let response: SihCreateSkinOrderResult;
    try {
      response = await this.sih.createSkinOrder({
        amountMicrousd: pending.amountMicrousd,
        customId: pending.attemptId,
        game: pending.game,
        marketHashName: pending.marketHashName,
        steamId64: pending.steamId64,
        test: command.skinTestMode,
        tradeToken: credential.token,
      });
    } catch (error) {
      await this.markAttemptFailed(pending, this.errorCode(error));
      throw error;
    }

    const providerOrderId = response.providerOrderId;
    await this.markSkinSubmitted(pending, providerOrderId, response);
    return {
      commandId: pending.commandId,
      providerOrderId,
      status: "submitted",
    };
  }

  private async claimNextSkinCommand(command: ProcessFulfillmentCommand): Promise<PendingSkinCommand | null> {
    return this.database.transaction(async (client) => {
      const claimed = await client.query<{
        amount_microusd: string;
        command_id: string;
        game: string | null;
        market_hash_name: string | null;
        order_id: string;
        order_line_id: string;
        steam_id64: string;
        user_id: string;
      }>(
        `
          SELECT
            fulfillment_commands.id AS command_id,
            fulfillment_commands.order_id,
            fulfillment_commands.order_line_id,
            orders.user_id,
            users.steam_id64,
            lower(catalog_products.game) AS game,
            catalog_products.supplier_item_id AS market_hash_name,
            supplier_listings.price_microusd::text AS amount_microusd
          FROM fulfillment_commands
          JOIN orders ON orders.id = fulfillment_commands.order_id
          JOIN users ON users.id = orders.user_id
          JOIN order_lines ON order_lines.id = fulfillment_commands.order_line_id
          JOIN catalog_products ON catalog_products.id = order_lines.product_id
          JOIN supplier_listings
            ON supplier_listings.supplier = 'sih'
            AND supplier_listings.game = lower(catalog_products.game)
            AND supplier_listings.market_hash_name = catalog_products.supplier_item_id
            AND supplier_listings.active = true
          WHERE fulfillment_commands.provider = 'sih'
            AND fulfillment_commands.command_type = 'sih_skin_purchase'
            AND fulfillment_commands.status = 'pending'
            AND fulfillment_commands.available_at <= clock_timestamp()
          ORDER BY fulfillment_commands.created_at ASC, fulfillment_commands.id ASC
          FOR UPDATE OF fulfillment_commands SKIP LOCKED
          LIMIT 1
        `,
      );
      const row = claimed.rows[0];
      if (row === undefined) return null;
      const game = this.sihGame(row.game);
      if (row.market_hash_name === null) throw new Error("FULFILLMENT_MARKET_HASH_NAME_MISSING");

      await client.query(
        `
          UPDATE fulfillment_commands
          SET status = 'processing',
              locked_at = clock_timestamp(),
              updated_at = clock_timestamp()
          WHERE id = $1
        `,
        [row.command_id],
      );
      const attempt = await client.query<{ id: string }>(
        `
          INSERT INTO fulfillment_provider_attempts (
            command_id,
            order_id,
            order_line_id,
            provider,
            operation,
            status,
            idempotency_key,
            request_snapshot
          )
          VALUES ($1, $2, $3, 'sih', 'create_order', 'started', gen_random_uuid()::text, $4::jsonb)
          RETURNING id
        `,
        [
          row.command_id,
          row.order_id,
          row.order_line_id,
          JSON.stringify({
            amountMicrousd: row.amount_microusd,
            marketHashName: row.market_hash_name,
            skinTestMode: command.skinTestMode,
          }),
        ],
      );
      const attemptId = attempt.rows[0]?.id;
      if (attemptId === undefined) throw new Error("FULFILLMENT_ATTEMPT_NOT_CREATED");
      await client.query(
        "UPDATE fulfillment_provider_attempts SET idempotency_key = $1 WHERE id = $1",
        [attemptId],
      );
      return {
        amountMicrousd: BigInt(row.amount_microusd),
        attemptId,
        commandId: row.command_id,
        game,
        marketHashName: row.market_hash_name,
        orderId: row.order_id,
        orderLineId: row.order_line_id,
        steamId64: row.steam_id64,
        userId: row.user_id,
      };
    });
  }

  private async markSkinSubmitted(pending: PendingSkinCommand, providerOrderId: string, response: SihCreateSkinOrderResult): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `
          UPDATE fulfillment_provider_attempts
          SET status = 'succeeded',
              provider_order_id = $2,
              response_snapshot = $3::jsonb,
              finished_at = clock_timestamp()
          WHERE id = $1
        `,
        [
          pending.attemptId,
          providerOrderId,
          JSON.stringify({
            projection: response.projection,
            providerOrderId,
          }),
        ],
      );
      await client.query(
        `
          UPDATE fulfillment_commands
          SET status = 'submitted',
              finished_at = clock_timestamp(),
              updated_at = clock_timestamp()
          WHERE id = $1
        `,
        [pending.commandId],
      );
      await client.query(
        "UPDATE order_lines SET status = 'supplier_submitted' WHERE id = $1",
        [pending.orderLineId],
      );
    });
  }

  private async markAttemptFailed(pending: PendingSkinCommand, errorCode: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `
          UPDATE fulfillment_provider_attempts
          SET status = 'failed',
              error_code = $2,
              finished_at = clock_timestamp()
          WHERE id = $1
        `,
        [pending.attemptId, errorCode],
      );
      await client.query(
        `
          UPDATE fulfillment_commands
          SET status = 'pending',
              last_error_code = $2,
              updated_at = clock_timestamp(),
              locked_at = NULL
          WHERE id = $1
        `,
        [pending.commandId, errorCode],
      );
    });
  }

  private errorCode(error: unknown): string {
    if (error instanceof SihProviderError) return error.code;
    if (error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)) return error.message;
    return "FULFILLMENT_PROVIDER_ERROR";
  }

  private sihGame(value: string | null): SihCatalogGame {
    if (value === "cs2" || value === "rust" || value === "tf2") return value;
    throw new Error("FULFILLMENT_SIH_GAME_UNSUPPORTED");
  }
}
