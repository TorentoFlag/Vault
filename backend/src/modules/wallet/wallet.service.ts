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

export type WalletTransactionHistoryReason = "purchase" | "top_up";

export type WalletTransactionHistoryItemDto = {
  amountCoinMinor: number;
  balanceAfterCoinMinor: number;
  createdAt: string;
  direction: "credit" | "debit";
  id: string;
  orderId?: string;
  reason: WalletTransactionHistoryReason;
  status: "completed";
};

export type WalletTransactionHistoryDto = {
  transactions: WalletTransactionHistoryItemDto[];
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

export type SettleOrderHoldCommand = {
  userId: string;
  orderId: string;
  captureCoinMinor: number;
  idempotencyKey: string;
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

type WalletTransactionHistoryRow = {
  amount_coin_minor: number;
  balance_after_coin_minor: string;
  created_at: Date;
  id: string;
  order_id: string | null;
  type: "order_hold_settlement" | "top_up_credit";
};

function assertPositiveCoinMinor(amountCoinMinor: number): void {
  if (!Number.isSafeInteger(amountCoinMinor) || amountCoinMinor <= 0) {
    throw new Error("WALLET_AMOUNT_INVALID");
  }
}

function assertNonNegativeCoinMinor(amountCoinMinor: number): void {
  if (!Number.isSafeInteger(amountCoinMinor) || amountCoinMinor < 0) {
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

  async listUserTransactions(userId: string): Promise<WalletTransactionHistoryDto> {
    const result = await this.database.query<WalletTransactionHistoryRow>(
      `
        WITH customer_entries AS (
          SELECT
            wallet_transactions.id,
            wallet_transactions.type,
            wallet_transactions.metadata ->> 'orderId' AS order_id,
            wallet_ledger_entries.amount_coin_minor,
            wallet_transactions.created_at,
            sum(wallet_ledger_entries.amount_coin_minor) OVER (
              ORDER BY wallet_transactions.created_at ASC, wallet_transactions.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )::text AS balance_after_coin_minor
          FROM wallet_transactions
          JOIN wallet_ledger_entries
            ON wallet_ledger_entries.transaction_id = wallet_transactions.id
          WHERE wallet_transactions.user_id = $1
            AND wallet_transactions.type IN ('top_up_credit', 'order_hold_settlement')
            AND wallet_transactions.status = 'posted'
            AND wallet_ledger_entries.account_key = $2
        )
        SELECT id, type, order_id, amount_coin_minor, balance_after_coin_minor, created_at
        FROM customer_entries
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `,
      [userId, customerAccount(userId)],
    );

    return {
      transactions: result.rows.map((row) => ({
        amountCoinMinor: Math.abs(row.amount_coin_minor),
        balanceAfterCoinMinor: Number(row.balance_after_coin_minor),
        createdAt: row.created_at.toISOString(),
        direction: row.amount_coin_minor >= 0 ? "credit" : "debit",
        id: row.id,
        ...(row.order_id === null ? {} : { orderId: row.order_id }),
        reason: row.type === "top_up_credit" ? "top_up" : "purchase",
        status: "completed",
      })),
    };
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

  async settleOrderHold(command: SettleOrderHoldCommand): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.lockUserBalance(client, command.userId);
      await this.settleOrderHoldWithClient(client, command);
    });
  }

  async settleOrderHoldWithClient(client: WalletQueryable, command: SettleOrderHoldCommand): Promise<void> {
    assertNonNegativeCoinMinor(command.captureCoinMinor);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);
    const hold = await client.query<{ amount_coin_minor: number; status: string }>(
      `
        SELECT amount_coin_minor, status
        FROM wallet_holds
        WHERE user_id = $1
          AND order_id = $2
        FOR UPDATE
        LIMIT 1
      `,
      [command.userId, command.orderId],
    );
    const holdRow = hold.rows[0];
    if (holdRow === undefined) throw new Error("WALLET_HOLD_NOT_FOUND");
    if (command.captureCoinMinor > holdRow.amount_coin_minor) throw new Error("WALLET_CAPTURE_EXCEEDS_HOLD");

    const existing = await client.query<{
      capture_coin_minor: number | null;
      order_id: string | null;
    }>(
      `
        SELECT
          metadata ->> 'orderId' AS order_id,
          (metadata ->> 'captureCoinMinor')::int AS capture_coin_minor
        FROM wallet_transactions
        WHERE user_id = $1
          AND idempotency_key = $2
          AND type = 'order_hold_settlement'
        LIMIT 1
      `,
      [command.userId, idempotencyKey],
    );
    const existingRow = existing.rows[0];
    if (existingRow !== undefined) {
      if (existingRow.order_id !== command.orderId || existingRow.capture_coin_minor !== command.captureCoinMinor) {
        throw new WalletIdempotencyConflictError();
      }
      return;
    }
    if (holdRow.status !== "active") throw new Error("WALLET_HOLD_ALREADY_SETTLED");

    const transaction = await client.query<{ id: string }>(
      `
        INSERT INTO wallet_transactions (user_id, idempotency_key, type, metadata)
        VALUES (
          $1,
          $2,
          'order_hold_settlement',
          jsonb_build_object(
            'orderId', $3::text,
            'reason', $4::text,
            'holdCoinMinor', $5::int,
            'captureCoinMinor', $6::int
          )
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [command.userId, idempotencyKey, command.orderId, command.reason, holdRow.amount_coin_minor, command.captureCoinMinor],
    );
    const transactionId = transaction.rows[0]?.id;
    if (transactionId === undefined) {
      const racedExisting = await client.query<{
        capture_coin_minor: number | null;
        order_id: string | null;
      }>(
        `
          SELECT
            metadata ->> 'orderId' AS order_id,
            (metadata ->> 'captureCoinMinor')::int AS capture_coin_minor
          FROM wallet_transactions
          WHERE user_id = $1
            AND idempotency_key = $2
            AND type = 'order_hold_settlement'
          LIMIT 1
        `,
        [command.userId, idempotencyKey],
      );
      const racedRow = racedExisting.rows[0];
      if (racedRow?.order_id !== command.orderId || racedRow.capture_coin_minor !== command.captureCoinMinor) {
        throw new WalletIdempotencyConflictError();
      }
      return;
    }

    if (command.captureCoinMinor > 0) {
      await client.query(
        `
          INSERT INTO wallet_ledger_entries (transaction_id, user_id, account_key, amount_coin_minor)
          VALUES
            ($1, $2, $3, $4),
            ($1, NULL, 'vault:order-revenue', $5)
        `,
        [
          transactionId,
          command.userId,
          customerAccount(command.userId),
          -command.captureCoinMinor,
          command.captureCoinMinor,
        ],
      );
    }

    await client.query(
      `
        UPDATE wallet_holds
        SET status = CASE
              WHEN $3 = 0 THEN 'released'
              WHEN $3 = amount_coin_minor THEN 'captured'
              ELSE 'partially_captured'
            END,
            captured_at = CASE WHEN $3 > 0 THEN clock_timestamp() ELSE captured_at END,
            released_at = CASE WHEN $3 < amount_coin_minor THEN clock_timestamp() ELSE released_at END
        WHERE user_id = $1
          AND order_id = $2
          AND status = 'active'
      `,
      [command.userId, command.orderId, command.captureCoinMinor],
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
