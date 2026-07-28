import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";
import { normalizeIdempotencyKey } from "../../common/idempotency/idempotency-key";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { ArcPayClient } from "../providers/arc-pay/arc-pay.client";
import { verifyFakeArcPayWebhookSignature } from "../providers/arc-pay/arc-pay-fake-webhook";
import { WalletService } from "../wallet/wallet.service";

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
  status: "provider_configuration_required" | "provider_creation_pending" | "checkout_pending" | "paid" | "failed";
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

export type HandleArcPayWebhookCommand = {
  providerEventId?: string;
  signature?: string;
  payload: unknown;
};

export type PaymentWebhookResultDto = {
  status: "processed" | "duplicate" | "ignored" | "unmatched" | "rejected";
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

type TopUpPaymentWebhookRow = {
  id: string;
  user_id: string;
  status: TopUpSessionDto["status"];
  coin_amount_minor: number;
  fiat_amount_minor: number;
  fiat_currency: TopUpSessionDto["fiatCurrency"];
};

type NormalizedArcPayWebhook = {
  providerEventId: string;
  eventType: string;
  providerSessionId: string;
  providerStatus: string;
  amountMinor: number;
  currency: string;
  payloadSnapshot: Record<string, unknown>;
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

function topUpReturnUrls(publicOrigin: string): { cancelUrl: string; failUrl: string; successUrl: string } {
  const base = new URL("/balance/top-up", publicOrigin);
  const success = new URL(base);
  success.searchParams.set("payment", "success");
  const fail = new URL(base);
  fail.searchParams.set("payment", "failed");
  const cancel = new URL(base);
  cancel.searchParams.set("payment", "cancelled");
  return {
    cancelUrl: cancel.href,
    failUrl: fail.href,
    successUrl: success.href,
  };
}

function providerErrorCode(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message.slice(0, 120);
  return "ARC_PAY_CHECKOUT_CREATE_FAILED";
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new BadRequestException("Arc Pay webhook payload must be an object");
}

function optionalStringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function optionalIntegerField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Number.isSafeInteger(value)) return value as number;
  }
  return undefined;
}

function normalizeArcPayWebhook(providerEventIdHeader: string | undefined, payload: unknown): NormalizedArcPayWebhook {
  const root = asRecord(payload);
  const payment = root.payment !== null && typeof root.payment === "object" && !Array.isArray(root.payment)
    ? root.payment as Record<string, unknown>
    : {};
  const providerEventId = providerEventIdHeader ?? optionalStringField(root, "eventId", "event_id", "id");
  const eventType = optionalStringField(root, "type", "event", "event_type");
  const providerSessionId = optionalStringField(root, "checkoutSessionId", "checkout_session_id")
    ?? optionalStringField(payment, "checkoutSessionId", "checkout_session_id", "checkout_session", "metadata_top_up_session");
  const providerStatus = optionalStringField(root, "status") ?? optionalStringField(payment, "status");
  const amountMinor = optionalIntegerField(root, "amount") ?? optionalIntegerField(payment, "amount", "captured_amount");
  const currency = optionalStringField(root, "currency") ?? optionalStringField(payment, "currency");

  if (!providerEventId || !eventType || !providerSessionId || !providerStatus || amountMinor === undefined || !currency) {
    throw new BadRequestException("Arc Pay webhook payload is missing required payment fields");
  }

  return {
    providerEventId,
    eventType,
    providerSessionId,
    providerStatus,
    amountMinor,
    currency: currency.toUpperCase(),
    payloadSnapshot: root,
  };
}

function isCapturedWebhook(event: NormalizedArcPayWebhook): boolean {
  return event.eventType === "payment.captured" || event.providerStatus === "captured" || event.providerStatus === "settled";
}

function isFailedWebhook(event: NormalizedArcPayWebhook): boolean {
  return ["payment.failed", "payment.declined", "payment.expired", "payment.voided"].includes(event.eventType)
    || ["failed", "declined", "expired", "voided"].includes(event.providerStatus);
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(WalletService) private readonly wallet: WalletService,
    @Inject(ArcPayClient) private readonly arcPay: ArcPayClient,
  ) {}

  async createTopUpSession(command: CreateTopUpSessionCommand): Promise<TopUpSessionDto> {
    assertCoinAmountMinor(command.coinAmountMinor);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);
    if (this.config.arcPay.providerMode === "real") {
      return this.createRealTopUpSession({
        ...command,
        idempotencyKey,
      });
    }
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
      if (this.config.arcPay.providerMode === "fake") {
        const providerSessionId = `fake_arc_pay_${id}`;
        const checkoutBaseUrl = this.config.arcPay.fakeCheckoutBaseUrl;
        if (checkoutBaseUrl === undefined) throw new ServiceUnavailableException("Arc Pay fake checkout URL is not configured");
        const checkoutUrl = `${checkoutBaseUrl}/checkout/${providerSessionId}`;
        await client.query(
          `
            UPDATE top_up_payments
            SET
              status = 'checkout_pending',
              provider_session_id = $2,
              provider_checkout_url = $3,
              provider_status = 'created',
              metadata = metadata || $4::jsonb,
              updated_at = now()
            WHERE id = $1
          `,
          [
            id,
            providerSessionId,
            checkoutUrl,
            JSON.stringify({
              fakeProvider: true,
              environment: this.config.arcPay.environment,
            }),
          ],
        );
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
              finished_at
            )
            VALUES ($1, $2, $3, 'succeeded', $4, $5::jsonb, $6::jsonb, now())
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
            JSON.stringify({
              checkoutUrl,
              providerSessionId,
              providerStatus: "created",
              fakeProvider: true,
            }),
          ],
        );
      } else {
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
      }

      const created = await this.findTopUpPayment(client, command.userId, idempotencyKey);
      if (created === null) throw new Error("TOP_UP_PAYMENT_NOT_FOUND_AFTER_CREATE");
      return toDto(created);
    });
  }

  private async createRealTopUpSession(command: CreateTopUpSessionCommand): Promise<TopUpSessionDto> {
    const publicOrigin = this.config.arcPay.publicOrigin;
    if (publicOrigin === undefined) throw new ServiceUnavailableException("Arc Pay public origin is not configured");
    if (this.config.arcPay.secretKeyFile === undefined) throw new ServiceUnavailableException("Arc Pay secret key is not configured");
    const hash = requestHash(command);
    const initial = await this.database.transaction(async (client) => {
      const existing = await this.findTopUpPayment(client, command.userId, command.idempotencyKey);
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
          VALUES ($1, $2, $3, $4, 'provider_creation_pending', $5, $6, 'RUB', $7, $8, $9::jsonb)
          RETURNING id
        `,
        [
          command.userId,
          command.idempotencyKey,
          hash,
          TOP_UP_PROVIDER,
          command.coinAmountMinor,
          fiatAmountMinor,
          COIN_RATE_FIAT_MINOR,
          COIN_RATE_COIN_MINOR,
          JSON.stringify({
            arcPayConfigured: true,
            environment: this.config.arcPay.environment,
          }),
        ],
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) throw new Error("TOP_UP_PAYMENT_NOT_CREATED");
      const providerIdempotencyKey = id;
      await client.query(
        `
          INSERT INTO payment_provider_attempts (
            top_up_payment_id,
            provider,
            idempotency_key,
            status,
            request_hash,
            request_snapshot
          )
          VALUES ($1, $2, $3, 'pending', $4, $5::jsonb)
        `,
        [
          id,
          TOP_UP_PROVIDER,
          providerIdempotencyKey,
          hash,
          JSON.stringify({
            amount: fiatAmountMinor,
            coinAmountMinor: command.coinAmountMinor,
            currency: "RUB",
            provider: TOP_UP_PROVIDER,
            providerPaymentMethod: "sbp",
            rate: {
              fiatMinor: COIN_RATE_FIAT_MINOR,
              coinMinor: COIN_RATE_COIN_MINOR,
            },
          }),
        ],
      );
      const created = await this.findTopUpPayment(client, command.userId, command.idempotencyKey);
      if (created === null) throw new Error("TOP_UP_PAYMENT_NOT_FOUND_AFTER_CREATE");
      return toDto(created);
    });

    if (initial.checkoutUrl !== null || initial.status !== "provider_creation_pending") return initial;

    const providerIdempotencyKey = initial.id;
    const urls = topUpReturnUrls(publicOrigin);
    let checkout: Awaited<ReturnType<ArcPayClient["createHostedCheckout"]>>;
    try {
      checkout = await this.arcPay.createHostedCheckout({
        amountMinor: initial.fiatAmountMinor,
        cancelUrl: urls.cancelUrl,
        description: "Пополнение баланса Vault Coins",
        externalId: initial.id,
        failUrl: urls.failUrl,
        idempotencyKey: providerIdempotencyKey,
        successUrl: urls.successUrl,
      });
    } catch (error) {
      const errorCode = providerErrorCode(error);
      await this.database.transaction(async (client) => {
        await client.query(
          `
            UPDATE top_up_payments
            SET
              status = 'failed',
              provider_status = 'checkout_create_failed',
              metadata = metadata || $2::jsonb,
              updated_at = now()
            WHERE id = $1
          `,
          [
            initial.id,
            JSON.stringify({
              providerErrorCode: errorCode,
            }),
          ],
        );
        await client.query(
          `
            UPDATE payment_provider_attempts
            SET
              status = 'failed',
              response_snapshot = $4::jsonb,
              error_code = $5,
              finished_at = now()
            WHERE provider = $1
              AND idempotency_key = $2
              AND top_up_payment_id = $3
          `,
          [
            TOP_UP_PROVIDER,
            providerIdempotencyKey,
            initial.id,
            JSON.stringify({
              providerStatus: "checkout_create_failed",
            }),
            errorCode,
          ],
        );
      });
      throw new ServiceUnavailableException("Arc Pay checkout creation failed");
    }

    return this.database.transaction(async (client) => {
      await client.query(
        `
          UPDATE top_up_payments
          SET
            status = 'checkout_pending',
            provider_session_id = $2,
            provider_checkout_url = $3,
            provider_status = 'created',
            updated_at = now()
          WHERE id = $1
        `,
        [initial.id, checkout.providerSessionId, checkout.checkoutUrl],
      );
      await client.query(
        `
          UPDATE payment_provider_attempts
          SET
            status = 'succeeded',
            response_snapshot = $4::jsonb,
            finished_at = now()
          WHERE provider = $1
            AND idempotency_key = $2
            AND top_up_payment_id = $3
        `,
        [
          TOP_UP_PROVIDER,
          providerIdempotencyKey,
          initial.id,
          JSON.stringify({
            checkoutUrl: checkout.checkoutUrl,
            providerSessionId: checkout.providerSessionId,
            providerStatus: "created",
          }),
        ],
      );
      const created = await this.findTopUpPayment(client, command.userId, command.idempotencyKey);
      if (created === null) throw new Error("TOP_UP_PAYMENT_NOT_FOUND_AFTER_PROVIDER_CREATE");
      return toDto(created);
    });
  }

  async handleArcPayWebhook(command: HandleArcPayWebhookCommand): Promise<PaymentWebhookResultDto> {
    if (this.config.arcPay.providerMode !== "fake") {
      throw new ServiceUnavailableException("Arc Pay webhook verification is not configured");
    }
    const signingSecretFile = this.config.arcPay.webhookSigningSecretFile;
    if (signingSecretFile === undefined) {
      throw new ServiceUnavailableException("Arc Pay webhook signing secret is not configured");
    }
    const signingSecret = (await readFile(signingSecretFile, "utf8")).trim();
    if (!verifyFakeArcPayWebhookSignature(command.payload, command.signature, signingSecret)) {
      throw new UnauthorizedException("Arc Pay webhook signature is invalid");
    }

    const event = normalizeArcPayWebhook(command.providerEventId, command.payload);
    return this.processVerifiedArcPayWebhook(event);
  }

  private async processVerifiedArcPayWebhook(event: NormalizedArcPayWebhook): Promise<PaymentWebhookResultDto> {
    return this.database.transaction(async (client) => {
      const insertedEvent = await client.query<{ id: string }>(
        `
          INSERT INTO payment_webhook_events (
            provider,
            provider_event_id,
            status,
            signature_status,
            payload_snapshot
          )
          VALUES ($1, $2, 'received', 'verified', $3::jsonb)
          ON CONFLICT (provider, provider_event_id) DO NOTHING
          RETURNING id
        `,
        [TOP_UP_PROVIDER, event.providerEventId, JSON.stringify(event.payloadSnapshot)],
      );
      const webhookEventId = insertedEvent.rows[0]?.id;
      if (webhookEventId === undefined) return { status: "duplicate" };

      const payment = await client.query<TopUpPaymentWebhookRow>(
        `
          SELECT
            id,
            user_id,
            status,
            coin_amount_minor,
            fiat_amount_minor,
            fiat_currency
          FROM top_up_payments
          WHERE provider = $1
            AND provider_session_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [TOP_UP_PROVIDER, event.providerSessionId],
      );
      const topUpPayment = payment.rows[0];
      if (topUpPayment === undefined) {
        await this.markWebhookEvent(client, event.providerEventId, "unmatched");
        return { status: "unmatched" };
      }

      if (topUpPayment.fiat_amount_minor !== event.amountMinor || topUpPayment.fiat_currency !== event.currency) {
        await this.markWebhookEvent(client, event.providerEventId, "rejected_amount_mismatch");
        return { status: "rejected" };
      }

      if (isCapturedWebhook(event)) {
        if (topUpPayment.status !== "paid") {
          await this.wallet.creditUserWithClient(client, {
            userId: topUpPayment.user_id,
            amountCoinMinor: topUpPayment.coin_amount_minor,
            idempotencyKey: `top-up:${topUpPayment.id}`,
            reason: "arc_pay_top_up_capture",
          });
          await client.query(
            `
              UPDATE top_up_payments
              SET status = 'paid', provider_status = $2, updated_at = now()
              WHERE id = $1
            `,
            [topUpPayment.id, event.providerStatus],
          );
        }
        await this.markWebhookEvent(client, event.providerEventId, "processed");
        return { status: "processed" };
      }

      if (isFailedWebhook(event)) {
        if (topUpPayment.status !== "paid") {
          await client.query(
            `
              UPDATE top_up_payments
              SET status = 'failed', provider_status = $2, updated_at = now()
              WHERE id = $1
            `,
            [topUpPayment.id, event.providerStatus],
          );
        }
        await this.markWebhookEvent(client, event.providerEventId, "processed");
        return { status: "processed" };
      }

      await this.markWebhookEvent(client, event.providerEventId, "ignored");
      return { status: "ignored" };
    });
  }

  private async markWebhookEvent(client: Queryable, providerEventId: string, status: string): Promise<void> {
    await client.query(
      `
        UPDATE payment_webhook_events
        SET status = $3, processed_at = now()
        WHERE provider = $1
          AND provider_event_id = $2
      `,
      [TOP_UP_PROVIDER, providerEventId, status],
    );
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
