import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";
import { normalizeIdempotencyKey } from "../../common/idempotency/idempotency-key";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";

type Queryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

const TOP_UP_MIN_COIN_MINOR = 10_000;
const TOP_UP_MAX_COIN_MINOR = 10_000_000;
const COIN_RATE_FIAT_MINOR = 100;
const COIN_RATE_COIN_MINOR = 150;
const TOP_UP_PROVIDER = "arc_pay";

export type CreateTopUpSessionCommand = {
  userId: string;
  idempotencyKey: string;
  coinAmountMinor: number;
};

export type TopUpSessionDto = {
  id: string;
  userId: string;
  status: "provider_configuration_required";
  provider: "arc_pay";
  coinAmountMinor: number;
  fiatAmountMinor: number;
  fiatCurrency: "RUB";
  rate: {
    fiatMinor: 100;
    coinMinor: 150;
  };
  checkoutUrl: string | null;
};

type TopUpPaymentRow = {
  id: string;
  user_id: string;
  status: TopUpSessionDto["status"];
  provider: TopUpSessionDto["provider"];
  coin_amount_minor: number;
  fiat_amount_minor: number;
  fiat_currency: TopUpSessionDto["fiatCurrency"];
  rate_fiat_minor: 100;
  rate_coin_minor: 150;
  provider_checkout_url: string | null;
  request_hash: string;
};

function requestHash(command: Pick<CreateTopUpSessionCommand, "coinAmountMinor" | "userId">): string {
  return createHash("sha256").update(JSON.stringify({
    coinAmountMinor: command.coinAmountMinor,
    userId: command.userId,
  }), "utf8").digest("hex");
}

function requireIdempotencyKey(value: string): string {
  const normalized = normalizeIdempotencyKey(value);
  if (normalized === undefined) throw new BadRequestException("Idempotency key is required");
  return normalized;
}

function assertCoinAmountMinor(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < TOP_UP_MIN_COIN_MINOR ||
    value > TOP_UP_MAX_COIN_MINOR ||
    value % 100 !== 0
  ) {
    throw new BadRequestException("Top-up amount must be a whole Coins amount between 100 and 100000 Coins");
  }
}

function fiatMinorForCoinMinor(coinAmountMinor: number): number {
  return Math.ceil((coinAmountMinor * COIN_RATE_FIAT_MINOR) / COIN_RATE_COIN_MINOR);
}

function toDto(row: TopUpPaymentRow): TopUpSessionDto {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    provider: row.provider,
    coinAmountMinor: row.coin_amount_minor,
    fiatAmountMinor: row.fiat_amount_minor,
    fiatCurrency: row.fiat_currency,
    rate: {
      fiatMinor: row.rate_fiat_minor,
      coinMinor: row.rate_coin_minor,
    },
    checkoutUrl: row.provider_checkout_url,
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createTopUpSession(command: CreateTopUpSessionCommand): Promise<TopUpSessionDto> {
    assertCoinAmountMinor(command.coinAmountMinor);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);
    const hash = requestHash(command);
    return this.database.transaction(async (client) => {
      const existing = await this.findTopUpPayment(client, command.userId, idempotencyKey);
      if (existing !== null) {
        if (existing.request_hash !== hash) throw new ConflictException("Idempotency key is already used for different top-up terms");
        return toDto(existing);
      }

      const fiatAmountMinor = fiatMinorForCoinMinor(command.coinAmountMinor);
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO top_up_payments (
            user_id,
            idempotency_key,
            request_hash,
            provider,
            status,
            coin_amount_minor,
            fiat_amount_minor,
            fiat_currency,
            rate_fiat_minor,
            rate_coin_minor,
            metadata
          )
          VALUES ($1, $2, $3, $4, 'provider_configuration_required', $5, $6, 'RUB', $7, $8, $9::jsonb)
          RETURNING id
        `,
        [
          command.userId,
          idempotencyKey,
          hash,
          TOP_UP_PROVIDER,
          command.coinAmountMinor,
          fiatAmountMinor,
          COIN_RATE_FIAT_MINOR,
          COIN_RATE_COIN_MINOR,
          JSON.stringify({
            arcPayConfigured: this.config.arcPay.secretKeyFile !== undefined,
            environment: this.config.arcPay.environment,
          }),
        ],
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) throw new Error("TOP_UP_PAYMENT_NOT_CREATED");
      await client.query(
        `
          INSERT INTO payment_provider_attempts (
            top_up_payment_id,
            provider,
            idempotency_key,
            status,
            request_hash,
            request_snapshot,
            response_snapshot,
            error_code,
            finished_at
          )
          VALUES ($1, $2, $3, 'configuration_required', $4, $5::jsonb, '{}'::jsonb, 'ARC_PAY_CONFIGURATION_REQUIRED', now())
        `,
        [
          id,
          TOP_UP_PROVIDER,
          idempotencyKey,
          hash,
          JSON.stringify({
            amount: fiatAmountMinor,
            coinAmountMinor: command.coinAmountMinor,
            currency: "RUB",
            provider: TOP_UP_PROVIDER,
            rate: {
              fiatMinor: COIN_RATE_FIAT_MINOR,
              coinMinor: COIN_RATE_COIN_MINOR,
            },
          }),
        ],
      );

      const created = await this.findTopUpPayment(client, command.userId, idempotencyKey);
      if (created === null) throw new Error("TOP_UP_PAYMENT_NOT_FOUND_AFTER_CREATE");
      return toDto(created);
    });
  }

  private async findTopUpPayment(client: Queryable, userId: string, idempotencyKey: string): Promise<TopUpPaymentRow | null> {
    const result = await client.query<TopUpPaymentRow>(
      `
        SELECT
          id,
          user_id,
          status,
          provider,
          coin_amount_minor,
          fiat_amount_minor,
          fiat_currency,
          rate_fiat_minor,
          rate_coin_minor,
          provider_checkout_url,
          request_hash
        FROM top_up_payments
        WHERE user_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [userId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }
}
