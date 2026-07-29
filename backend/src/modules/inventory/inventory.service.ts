import { Inject, Injectable } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";

type Queryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

export type InventoryActionDto = {
  enabled: false;
  reason: "not_supported";
};

export type InventoryItemDto = {
  id: string;
  orderId: string;
  productSlug: string;
  title: string;
  unitPriceCoinMinor: number;
  acquiredAt: string;
  status: "owned";
  actions: {
    sellToSite: InventoryActionDto;
    withdrawToSteam: InventoryActionDto;
  };
};

export type InventoryDto = {
  items: InventoryItemDto[];
};

type InventoryRow = {
  acquired_at: Date;
  id: string;
  order_id: string;
  product_slug: string;
  title: string;
  unit_price_coin_minor: number;
};

@Injectable()
export class InventoryService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listUserInventory(userId: string): Promise<InventoryDto> {
    return this.listUserInventoryWithClient(this.database, userId);
  }

  private async listUserInventoryWithClient(client: Queryable, userId: string): Promise<InventoryDto> {
    const result = await client.query<InventoryRow>(
      `
        SELECT
          order_lines.id,
          order_lines.order_id,
          order_lines.product_slug,
          order_lines.title,
          order_lines.unit_price_coin_minor,
          order_lines.created_at AS acquired_at
        FROM order_lines
        JOIN orders ON orders.id = order_lines.order_id
        WHERE orders.user_id = $1
          AND order_lines.kind = 'skins'
          AND order_lines.status = 'supplier_finished'
        ORDER BY order_lines.created_at DESC, order_lines.id DESC
      `,
      [userId],
    );

    return {
      items: result.rows.map((item) => ({
        actions: {
          sellToSite: { enabled: false, reason: "not_supported" },
          withdrawToSteam: { enabled: false, reason: "not_supported" },
        },
        acquiredAt: item.acquired_at.toISOString(),
        id: item.id,
        orderId: item.order_id,
        productSlug: item.product_slug,
        status: "owned",
        title: item.title,
        unitPriceCoinMinor: item.unit_price_coin_minor,
      })),
    };
  }
}
