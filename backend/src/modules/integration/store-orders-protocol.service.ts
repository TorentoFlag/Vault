import { ConflictException, Inject, Injectable, NotFoundException, PreconditionFailedException } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";
import type { AppConfig } from "../../config/app-config";
import { APP_CONFIG } from "../../config/app-config.module";
import { WalletService } from "../wallet/wallet.service";

type Queryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

type StoreOrderResource = {
  readonly id: string;
  readonly revision: string;
  readonly productTitle: string;
  readonly productType: "auto_delivery";
  readonly priceMinor: number;
  readonly currency: "FC";
  readonly email: string;
  readonly phone: "";
  readonly deliveryAddress: string;
  readonly bookingStartDate: null;
  readonly bookingEndDate: null;
  readonly isProcessed: boolean;
  readonly payment: { readonly state: "succeeded"; readonly providerPaymentId: null };
  readonly refund: null;
  readonly createdAt: string;
};

type StoreOrderListRow = {
  readonly created_at: Date;
  readonly delivery_email: string;
  readonly id: string;
  readonly line_count: number | string;
  readonly processed: boolean;
  readonly title: string;
  readonly total_coin_minor: number;
  readonly updated_at: Date;
  readonly variant_summary: string;
};

type OrderRow = {
  readonly created_at: Date;
  readonly id: string;
  readonly status: string;
  readonly total_coin_minor: number;
  readonly updated_at: Date;
  readonly user_id: string;
};

type LineRow = {
  readonly currency: string;
  readonly delivery_email: string;
  readonly id: string;
  readonly kind: string;
  readonly line_index: number;
  readonly nominal_minor: number;
  readonly product_slug: string;
  readonly region_code: string;
  readonly status: string;
  readonly title: string;
  readonly unit_price_coin_minor: number;
};

@Injectable()
export class StoreOrdersProtocolService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listOrders(): Promise<{ readonly items: readonly StoreOrderResource[]; readonly nextCursor: null }> {
    const result = await this.database.query<StoreOrderListRow>(listOrdersSql());
    return { items: result.rows.map(toStoreOrder), nextCursor: null };
  }

  async updateProcessing(
    orderId: string,
    input: {
      readonly actorId: string;
      readonly idempotencyKey: string | null;
      readonly ifMatch: string | undefined;
      readonly isProcessed: boolean;
    },
  ): Promise<StoreOrderResource> {
    if (!input.isProcessed) throw new ConflictException("Manual Apple gift-card orders cannot be reopened");
    if (!input.idempotencyKey) throw new ConflictException("Idempotency key is required");

    await this.database.transaction(async (client) => {
      const order = await this.lockOrder(client, orderId);
      const lines = await this.loadLines(client, orderId);
      if (lines.length === 0 || lines.some((line) => line.kind !== "apple_gift_card")) {
        throw new ConflictException("Only Apple gift-card orders can be completed manually");
      }
      const expectedRevision = revision(order.id, order.updated_at, order.status === "fulfilled");
      if (unquoteEtag(input.ifMatch) !== expectedRevision) {
        throw new PreconditionFailedException("Order revision has changed");
      }
      if (order.status === "fulfilled") return;
      if (order.status !== "held") {
        throw new ConflictException("Only held orders can be completed manually");
      }

      await client.query(
        `
          UPDATE fulfillment_commands
          SET status = 'completed',
              finished_at = COALESCE(finished_at, clock_timestamp()),
              updated_at = clock_timestamp()
          WHERE order_id = $1
            AND command_type = 'manual_apple_gift_card'
            AND status <> 'completed'
        `,
        [orderId],
      );
      await client.query(
        `
          UPDATE order_lines
          SET status = 'supplier_finished'
          WHERE order_id = $1
            AND kind = 'apple_gift_card'
            AND status <> 'supplier_finished'
        `,
        [orderId],
      );
      await this.wallet.settleOrderHoldWithClient(client, {
        userId: order.user_id,
        orderId,
        captureCoinMinor: order.total_coin_minor,
        idempotencyKey: `fulfillment-settle:${orderId}`,
        reason: "fulfillment_terminal",
      });
      await client.query(
        `
          UPDATE orders
          SET status = 'fulfilled',
              updated_at = clock_timestamp()
          WHERE id = $1
        `,
        [orderId],
      );
      await this.enqueueCompletedEvent(client, order, lines);
    });

    return this.requireOrder(orderId);
  }

  operationByRequest(requestId: string) {
    return { requestId, status: "in_progress" as const };
  }

  private async requireOrder(orderId: string): Promise<StoreOrderResource> {
    const result = await this.database.query<StoreOrderListRow>(listOrdersSql("AND orders.id = $1"), [orderId]);
    const item = result.rows[0];
    if (!item) throw new NotFoundException("Order not found");
    return toStoreOrder(item);
  }

  private async lockOrder(client: Queryable, orderId: string): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
      `
        SELECT id, user_id, status, total_coin_minor, created_at, updated_at
        FROM orders
        WHERE id = $1
        FOR UPDATE
      `,
      [orderId],
    );
    const order = result.rows[0];
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  private async loadLines(client: Queryable, orderId: string): Promise<LineRow[]> {
    const result = await client.query<LineRow>(
      `
        SELECT
          order_lines.id,
          order_lines.line_index,
          order_lines.kind,
          order_lines.status,
          order_lines.title,
          order_lines.product_slug,
          order_lines.unit_price_coin_minor,
          apple_gift_card_fulfillments.delivery_email,
          apple_gift_card_fulfillments.region_code,
          apple_gift_card_fulfillments.currency,
          apple_gift_card_fulfillments.nominal_minor
        FROM order_lines
        LEFT JOIN apple_gift_card_fulfillments
          ON apple_gift_card_fulfillments.order_line_id = order_lines.id
        WHERE order_lines.order_id = $1
        ORDER BY order_lines.line_index ASC
        FOR UPDATE OF order_lines, apple_gift_card_fulfillments
      `,
      [orderId],
    );
    return result.rows;
  }

  private async enqueueCompletedEvent(client: Queryable, order: OrderRow, lines: readonly LineRow[]): Promise<void> {
    const now = new Date();
    const event = {
      schemaVersion: 2,
      eventId: `vault.order.${order.id}.completed`,
      eventType: "order.completed",
      source: "customer",
      occurredAt: now.toISOString(),
      site: { domain: new URL(this.config.integration.publicOrigin).hostname },
      subject: { type: "order", externalId: order.id },
      data: {
        externalOrderId: order.id,
        externalUserId: order.user_id,
        status: "completed",
        payment: {
          status: "paid",
          method: { type: "internal_balance", displayName: "Vault Coins", provider: null },
          paidAt: order.created_at.toISOString(),
        },
        totalAmount: (order.total_coin_minor / 100).toFixed(2),
        currency: "FC",
        createdAtExternal: order.created_at.toISOString(),
        paidAtExternal: order.created_at.toISOString(),
        completedAtExternal: now.toISOString(),
        items: lines.map((line) => ({
          externalItemId: line.id,
          name: line.title,
          marketHashName: line.product_slug,
          priceAmount: (line.unit_price_coin_minor / 100).toFixed(2),
          currency: "FC",
        })),
      },
    };
    await client.query(
      `
        INSERT INTO vv_admin_integration_outbox (
          event_id,
          event_type,
          subject_type,
          subject_external_id,
          payload
        )
        VALUES ($1, 'order.completed', 'order', $2, $3::jsonb)
        ON CONFLICT (event_id) DO NOTHING
      `,
      [event.eventId, order.id, JSON.stringify(event)],
    );
  }
}

function listOrdersSql(extraWhere = ""): string {
  return `
    SELECT
      orders.id::text,
      orders.total_coin_minor,
      orders.created_at,
      orders.updated_at,
      min(order_lines.title) AS title,
      count(order_lines.id)::text AS line_count,
      min(apple_gift_card_fulfillments.delivery_email) AS delivery_email,
      string_agg(
        DISTINCT apple_gift_card_fulfillments.region_code || ' · ' ||
          trim(to_char(apple_gift_card_fulfillments.nominal_minor::numeric / 100, 'FM999999990.##')) || ' ' ||
          apple_gift_card_fulfillments.currency,
        ', '
      ) AS variant_summary,
      bool_and(order_lines.status = 'supplier_finished') AS processed
    FROM orders
    JOIN order_lines
      ON order_lines.order_id = orders.id
    JOIN apple_gift_card_fulfillments
      ON apple_gift_card_fulfillments.order_line_id = order_lines.id
    WHERE order_lines.kind = 'apple_gift_card'
      ${extraWhere}
    GROUP BY orders.id
    HAVING count(order_lines.id) = (
      SELECT count(*)
      FROM order_lines AS all_order_lines
      WHERE all_order_lines.order_id = orders.id
    )
    ORDER BY orders.created_at DESC
    LIMIT 100
  `;
}

function toStoreOrder(row: StoreOrderListRow): StoreOrderResource {
  return {
    id: row.id,
    revision: revision(row.id, row.updated_at, row.processed),
    productTitle: Number(row.line_count) > 1 ? `${row.title} × ${row.line_count}` : row.title,
    productType: "auto_delivery",
    priceMinor: row.total_coin_minor,
    currency: "FC",
    email: row.delivery_email,
    phone: "",
    deliveryAddress: row.variant_summary,
    bookingStartDate: null,
    bookingEndDate: null,
    isProcessed: row.processed,
    payment: { state: "succeeded", providerPaymentId: null },
    refund: null,
    createdAt: row.created_at.toISOString(),
  };
}

function revision(orderId: string, updatedAt: Date, isProcessed: boolean): string {
  return `order:${orderId}:${updatedAt.toISOString()}:${isProcessed}`;
}

function unquoteEtag(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) return trimmed.slice(1, -1);
  return trimmed;
}
