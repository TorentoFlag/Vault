import { Inject, Injectable } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";
import type { CatalogProductKind } from "../catalog/catalog.types";
import type { CheckoutRecipientSnapshot } from "../checkout/checkout.service";

type Queryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

export type OrderHistoryLineDto = {
  id: string;
  productSlug: string;
  kind: CatalogProductKind;
  title: string;
  quantity: 1;
  unitPriceCoinMinor: number;
  recipientSnapshot: CheckoutRecipientSnapshot;
};

export type OrderHistoryItemDto = {
  id: string;
  userId: string;
  status: "held";
  totalCoinMinor: number;
  recipientSnapshots: CheckoutRecipientSnapshot[];
  createdAt: string;
  lines: OrderHistoryLineDto[];
};

export type OrderHistoryDto = {
  orders: OrderHistoryItemDto[];
};

type OrderRow = {
  id: string;
  user_id: string;
  status: OrderHistoryItemDto["status"];
  total_coin_minor: number;
  recipient_snapshots: CheckoutRecipientSnapshot[];
  created_at: Date;
};

type OrderLineRow = {
  id: string;
  order_id: string;
  line_index: number;
  product_slug: string;
  kind: CatalogProductKind;
  title: string;
  quantity: number;
  unit_price_coin_minor: number;
  recipient_snapshot: CheckoutRecipientSnapshot;
};

@Injectable()
export class OrdersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listUserOrders(userId: string): Promise<OrderHistoryDto> {
    return this.listUserOrdersWithClient(this.database, userId);
  }

  private async listUserOrdersWithClient(client: Queryable, userId: string): Promise<OrderHistoryDto> {
    const orders = await client.query<OrderRow>(
      `
        SELECT id, user_id, status, total_coin_minor, recipient_snapshots, created_at
        FROM orders
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [userId],
    );
    if (orders.rows.length === 0) return { orders: [] };

    const orderIds = orders.rows.map((order) => order.id);
    const lines = await client.query<OrderLineRow>(
      `
        SELECT id, order_id, line_index, product_slug, kind, title, quantity, unit_price_coin_minor, recipient_snapshot
        FROM order_lines
        WHERE order_id = ANY($1::uuid[])
        ORDER BY order_id ASC, line_index ASC
      `,
      [orderIds],
    );
    const linesByOrder = new Map<string, OrderLineRow[]>();
    for (const line of lines.rows) {
      const current = linesByOrder.get(line.order_id) ?? [];
      current.push(line);
      linesByOrder.set(line.order_id, current);
    }

    return {
      orders: orders.rows.map((order) => ({
        id: order.id,
        userId: order.user_id,
        status: order.status,
        totalCoinMinor: order.total_coin_minor,
        recipientSnapshots: order.recipient_snapshots,
        createdAt: order.created_at.toISOString(),
        lines: (linesByOrder.get(order.id) ?? []).map((line) => ({
          id: line.id,
          productSlug: line.product_slug,
          kind: line.kind,
          title: line.title,
          quantity: 1,
          unitPriceCoinMinor: line.unit_price_coin_minor,
          recipientSnapshot: line.recipient_snapshot,
        })),
      })),
    };
  }
}
