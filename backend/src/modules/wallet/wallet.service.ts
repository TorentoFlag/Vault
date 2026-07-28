import { Inject, Injectable } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import { DatabaseService } from "../../common/database/database.service";
import { normalizeIdempotencyKey } from "../../common/idempotency/idempotency-key";

export type WalletQueryable = {
  query: <Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => Promise<QueryResult<Row>>;
};

export type WalletBalanceDto = {
  postedCoinMinor: number;
  heldCoinMinor: number;
  availableCoinMinor: number;
};

export type CreditUserCommand = {
  userId: string;
  amountCoinMinor: number;
  idempotencyKey: string;
  reason: string;
};

export type CreateHoldCommand = {
  userId: string;
  orderId: string;
  amountCoinMinor: number;
  reason: string;
};

export class WalletInsufficientFundsError extends Error {
  readonly code = "WALLET_INSUFFICIENT_FUNDS";

  constructor(readonly balance: WalletBalanceDto, readonly requestedCoinMinor: number) {
    super("Insufficient Coins balance");
  }
}

export class WalletIdempotencyConflictError extends Error {
  readonly code = "WALLET_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Wallet idempotency key is already used for different financial terms");
  }
}

function assertPositiveCoinMinor(amountCoinMinor: number): void {
  if (!Number.isSafeInteger(amountCoinMinor) || amountCoinMinor <= 0) {
    throw new Error("WALLET_AMOUNT_INVALID");
  }
}

function requireIdempotencyKey(value: string): string {
  const normalized = normalizeIdempotencyKey(value);
  if (normalized === undefined) throw new Error("WALLET_IDEMPOTENCY_KEY_REQUIRED");
  return normalized;
}

function customerAccount(userId: string): string {
  return `customer:${userId}`;
}

@Injectable()
export class WalletService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async creditUser(command: CreditUserCommand): Promise<void> {
    await this.database.transaction(async (client) => this.creditUserWithClient(client, command));
  }

  async creditUserWithClient(client: WalletQueryable, command: CreditUserCommand): Promise<void> {
    assertPositiveCoinMinor(command.amountCoinMinor);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);
    const transaction = await client.query<{ id: string }>(
      `
        INSERT INTO wallet_transactions (user_id, idempotency_key, type, metadata)
        VALUES ($1, $2, 'top_up_credit', jsonb_build_object('reason', $3::text, 'amountCoinMinor', $4::int))
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [command.userId, idempotencyKey, command.reason, command.amountCoinMinor],
    );
    const transactionId = transaction.rows[0]?.id;
    if (transactionId === undefined) {
      const existing = await client.query<{ amount_coin_minor: number | null }>(
        `
          SELECT (metadata ->> 'amountCoinMinor')::int AS amount_coin_minor
          FROM wallet_transactions
          WHERE user_id = $1
            AND idempotency_key = $2
            AND type = 'top_up_credit'
          LIMIT 1
        `,
        [command.userId, idempotencyKey],
      );
      if (existing.rows[0]?.amount_coin_minor !== command.amountCoinMinor) {
        throw new WalletIdempotencyConflictError();
      }
      return;
    }

    await client.query(
      `
        INSERT INTO wallet_ledger_entries (transaction_id, user_id, account_key, amount_coin_minor)
        VALUES
          ($1, $2, $3, $4),
          ($1, NULL, 'vault:coins-liability', $5)
      `,
      [transactionId, command.userId, customerAccount(command.userId), command.amountCoinMinor, -command.amountCoinMinor],
    );
  }

  async getBalance(userId: string): Promise<WalletBalanceDto> {
    return this.getBalanceWithClient(this.database, userId);
  }

  async lockUserBalance(client: WalletQueryable, userId: string): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wallet:${userId}`]);
  }

  async createHold(client: WalletQueryable, command: CreateHoldCommand): Promise<void> {
    assertPositiveCoinMinor(command.amountCoinMinor);
    const balance = await this.getBalanceWithClient(client, command.userId);
    if (balance.availableCoinMinor < command.amountCoinMinor) {
      throw new WalletInsufficientFundsError(balance, command.amountCoinMinor);
    }
    await client.query(
      `
        INSERT INTO wallet_holds (user_id, order_id, amount_coin_minor, reason)
        VALUES ($1, $2, $3, $4)
      `,
      [command.userId, command.orderId, command.amountCoinMinor, command.reason],
    );
  }

  private async getBalanceWithClient(client: WalletQueryable, userId: string): Promise<WalletBalanceDto> {
    const result = await client.query<{ posted: string; held: string }>(
      `
        SELECT
          COALESCE((
            SELECT sum(amount_coin_minor)
            FROM wallet_ledger_entries
            WHERE account_key = $1
          ), 0)::text AS posted,
          COALESCE((
            SELECT sum(amount_coin_minor)
            FROM wallet_holds
            WHERE user_id = $2
              AND status = 'active'
          ), 0)::text AS held
      `,
      [customerAccount(userId), userId],
    );
    const postedCoinMinor = Number(result.rows[0]?.posted ?? "0");
    const heldCoinMinor = Number(result.rows[0]?.held ?? "0");
    return {
      postedCoinMinor,
      heldCoinMinor,
      availableCoinMinor: postedCoinMinor - heldCoinMinor,
    };
  }
}
