import { Inject, Injectable } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";

type Queryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

export type FulfillmentTradeEventStatus = "completed" | "pending" | "processing";

export type FulfillmentTradeEventDto = {
  createdAt: string;
  direction: "purchase";
  id: string;
  itemId: string;
  orderNumber: string;
  status: FulfillmentTradeEventStatus;
  title: string;
};

export type FulfillmentTradeHistoryDto = {
  events: FulfillmentTradeEventDto[];
};

type FulfillmentTradeEventRow = {
  command_id: string;
  command_status: string;
  event_created_at: Date;
  last_attempt_id: string | null;
  line_id: string;
  line_status: string;
  order_id: string;
  title: string;
};

function orderNumberFromId(id: string): string {
  return `VLT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function eventStatus(lineStatus: string, commandStatus: string): FulfillmentTradeEventStatus {
  if (lineStatus === "supplier_finished") return "completed";
  if (lineStatus === "held" || commandStatus === "pending") return "pending";
  return "processing";
}

@Injectable()
export class FulfillmentHistoryService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listUserTradeEvents(userId: string): Promise<FulfillmentTradeHistoryDto> {
    return this.listUserTradeEventsWithClient(this.database, userId);
  }

  private async listUserTradeEventsWithClient(client: Queryable, userId: string): Promise<FulfillmentTradeHistoryDto> {
    const result = await client.query<FulfillmentTradeEventRow>(
      `
        SELECT
          fulfillment_commands.id AS command_id,
          fulfillment_commands.status AS command_status,
          COALESCE(last_attempt.created_at, fulfillment_commands.updated_at, fulfillment_commands.created_at) AS event_created_at,
          last_attempt.id AS last_attempt_id,
          order_lines.id AS line_id,
          order_lines.status AS line_status,
          orders.id AS order_id,
          order_lines.title
        FROM fulfillment_commands
        JOIN orders ON orders.id = fulfillment_commands.order_id
        JOIN order_lines ON order_lines.id = fulfillment_commands.order_line_id
        LEFT JOIN LATERAL (
          SELECT id, created_at
          FROM fulfillment_provider_attempts
          WHERE fulfillment_provider_attempts.command_id = fulfillment_commands.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ) AS last_attempt ON true
        WHERE orders.user_id = $1
          AND fulfillment_commands.command_type = 'sih_skin_purchase'
          AND order_lines.kind = 'skins'
        ORDER BY event_created_at DESC, fulfillment_commands.id DESC
        LIMIT 100
      `,
      [userId],
    );

    return {
      events: result.rows.map((row) => ({
        createdAt: row.event_created_at.toISOString(),
        direction: "purchase",
        id: row.last_attempt_id ?? row.command_id,
        itemId: row.line_id,
        orderNumber: orderNumberFromId(row.order_id),
        status: eventStatus(row.line_status, row.command_status),
        title: row.title,
      })),
    };
  }
}
