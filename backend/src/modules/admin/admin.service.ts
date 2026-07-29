import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";

export type AdminOperationsOverviewDto = {
  fulfillment: {
    commands: Array<{
      commandType: string;
      createdAt: string;
      id: string;
      lastAttemptOperation: string | null;
      lastAttemptStatus: string | null;
      lastErrorCode: string | null;
      orderId: string;
      orderLineId: string;
      provider: string;
      status: string;
      updatedAt: string;
    }>;
  };
  generatedAt: string;
  orders: {
    problem: Array<{
      createdAt: string;
      id: string;
      lineCount: number;
      openLineCount: number;
      status: string;
      totalCoinMinor: number;
      updatedAt: string;
      userId: string;
    }>;
  };
  payments: {
    manualReview: Array<{
      coinAmountMinor: number;
      createdAt: string;
      fiatAmountMinor: number;
      fiatCurrency: string;
      id: string;
      manualReviewReason: string | null;
      provider: string;
      providerStatus: string | null;
      status: string;
      updatedAt: string;
      userId: string;
    }>;
  };
  webhooks: {
    problem: Array<{
      id: string;
      processedAt: string | null;
      provider: string;
      providerEventId: string;
      receivedAt: string;
      signatureStatus: string;
      status: string;
    }>;
  };
};

type PaymentRow = {
  coin_amount_minor: number;
  created_at: Date;
  fiat_amount_minor: number;
  fiat_currency: string;
  id: string;
  manual_review_reason: string | null;
  provider: string;
  provider_status: string | null;
  status: string;
  updated_at: Date;
  user_id: string;
};

type OrderRow = {
  created_at: Date;
  id: string;
  line_count: string;
  open_line_count: string;
  status: string;
  total_coin_minor: number;
  updated_at: Date;
  user_id: string;
};

type FulfillmentCommandRow = {
  command_type: string;
  created_at: Date;
  id: string;
  last_attempt_operation: string | null;
  last_attempt_status: string | null;
  last_error_code: string | null;
  order_id: string;
  order_line_id: string;
  provider: string;
  status: string;
  updated_at: Date;
};

type WebhookRow = {
  id: string;
  processed_at: Date | null;
  provider: string;
  provider_event_id: string;
  received_at: Date;
  signature_status: string;
  status: string;
};

function countTextToNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("ADMIN_COUNT_INVALID");
  return parsed;
}

@Injectable()
export class AdminService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getOperationsOverview(): Promise<AdminOperationsOverviewDto> {
    const [payments, orders, fulfillment, webhooks] = await Promise.all([
      this.database.query<PaymentRow>(
        `
          SELECT
            id,
            user_id,
            status,
            provider,
            provider_status,
            coin_amount_minor,
            fiat_amount_minor,
            fiat_currency,
            metadata->>'manualReviewReason' AS manual_review_reason,
            created_at,
            updated_at
          FROM top_up_payments
          WHERE status = 'manual_review'
          ORDER BY updated_at DESC, id DESC
          LIMIT 100
        `,
      ),
      this.database.query<OrderRow>(
        `
          SELECT
            orders.id,
            orders.user_id,
            orders.status,
            orders.total_coin_minor,
            orders.created_at,
            orders.updated_at,
            count(order_lines.id)::text AS line_count,
            count(order_lines.id) FILTER (WHERE order_lines.status NOT IN ('supplier_finished', 'supplier_failed'))::text AS open_line_count
          FROM orders
          LEFT JOIN order_lines ON order_lines.order_id = orders.id
          WHERE orders.status IN ('manual_review', 'failed')
          GROUP BY orders.id
          ORDER BY orders.updated_at DESC, orders.id DESC
          LIMIT 100
        `,
      ),
      this.database.query<FulfillmentCommandRow>(
        `
          SELECT
            fulfillment_commands.id,
            fulfillment_commands.order_id,
            fulfillment_commands.order_line_id,
            fulfillment_commands.provider,
            fulfillment_commands.command_type,
            fulfillment_commands.status,
            fulfillment_commands.last_error_code,
            fulfillment_commands.created_at,
            fulfillment_commands.updated_at,
            last_attempt.operation AS last_attempt_operation,
            last_attempt.status AS last_attempt_status
          FROM fulfillment_commands
          LEFT JOIN LATERAL (
            SELECT operation, status
            FROM fulfillment_provider_attempts
            WHERE fulfillment_provider_attempts.command_id = fulfillment_commands.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          ) AS last_attempt ON true
          WHERE fulfillment_commands.status IN ('pending', 'processing', 'submitted', 'manual_review', 'failed')
          ORDER BY fulfillment_commands.updated_at DESC, fulfillment_commands.id DESC
          LIMIT 100
        `,
      ),
      this.database.query<WebhookRow>(
        `
          SELECT
            id,
            provider,
            provider_event_id,
            status,
            signature_status,
            received_at,
            processed_at
          FROM payment_webhook_events
          WHERE status NOT IN ('processed', 'duplicate', 'ignored')
          ORDER BY received_at DESC, id DESC
          LIMIT 100
        `,
      ),
    ]);

    return {
      fulfillment: {
        commands: fulfillment.rows.map((row) => ({
          commandType: row.command_type,
          createdAt: row.created_at.toISOString(),
          id: row.id,
          lastAttemptOperation: row.last_attempt_operation,
          lastAttemptStatus: row.last_attempt_status,
          lastErrorCode: row.last_error_code,
          orderId: row.order_id,
          orderLineId: row.order_line_id,
          provider: row.provider,
          status: row.status,
          updatedAt: row.updated_at.toISOString(),
        })),
      },
      generatedAt: new Date().toISOString(),
      orders: {
        problem: orders.rows.map((row) => ({
          createdAt: row.created_at.toISOString(),
          id: row.id,
          lineCount: countTextToNumber(row.line_count),
          openLineCount: countTextToNumber(row.open_line_count),
          status: row.status,
          totalCoinMinor: row.total_coin_minor,
          updatedAt: row.updated_at.toISOString(),
          userId: row.user_id,
        })),
      },
      payments: {
        manualReview: payments.rows.map((row) => ({
          coinAmountMinor: row.coin_amount_minor,
          createdAt: row.created_at.toISOString(),
          fiatAmountMinor: row.fiat_amount_minor,
          fiatCurrency: row.fiat_currency,
          id: row.id,
          manualReviewReason: row.manual_review_reason,
          provider: row.provider,
          providerStatus: row.provider_status,
          status: row.status,
          updatedAt: row.updated_at.toISOString(),
          userId: row.user_id,
        })),
      },
      webhooks: {
        problem: webhooks.rows.map((row) => ({
          id: row.id,
          processedAt: row.processed_at?.toISOString() ?? null,
          provider: row.provider,
          providerEventId: row.provider_event_id,
          receivedAt: row.received_at.toISOString(),
          signatureStatus: row.signature_status,
          status: row.status,
        })),
      },
    };
  }
}
