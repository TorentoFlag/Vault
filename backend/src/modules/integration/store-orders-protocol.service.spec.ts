import { describe, expect, it, vi } from "vitest";

import { StoreOrdersProtocolService } from "./store-orders-protocol.service";

const orderId = "a9d85b61-fcc7-4177-8793-44bb65eef2d0";
const lineId = "11111111-1111-4111-8111-111111111111";

describe("StoreOrdersProtocolService", () => {
  it("lists manual Apple gift-card orders for VV Admin", async () => {
    const database = createDatabase([
      {
        rows: [
          {
            created_at: new Date("2026-08-14T16:17:19.000Z"),
            delivery_email: "buyer@example.test",
            id: orderId,
            line_count: 1,
            processed: false,
            title: "Подарочная карта Apple",
            total_coin_minor: 26668,
            updated_at: new Date("2026-08-14T16:18:00.000Z"),
            variant_summary: "EU · 2 EUR",
          },
        ],
      },
    ]);
    const service = new StoreOrdersProtocolService(database as never, wallet() as never, config() as never);

    await expect(service.listOrders()).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: orderId,
          productTitle: "Подарочная карта Apple",
          productType: "auto_delivery",
          priceMinor: 26668,
          currency: "FC",
          email: "buyer@example.test",
          phone: "",
          deliveryAddress: "EU · 2 EUR",
          isProcessed: false,
          payment: { state: "succeeded", providerPaymentId: null },
          refund: null,
        }),
      ],
      nextCursor: null,
    });
  });

  it("marks a manual Apple gift-card order fulfilled and enqueues order.completed", async () => {
    const database = createDatabase([
      { rows: [orderRow("held")] },
      { rows: [lineRow("held")] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      {
        rows: [
          {
            created_at: new Date("2026-08-14T16:17:19.000Z"),
            delivery_email: "buyer@example.test",
            id: orderId,
            line_count: 1,
            processed: true,
            title: "Подарочная карта Apple",
            total_coin_minor: 26668,
            updated_at: new Date("2026-08-14T16:19:00.000Z"),
            variant_summary: "EU · 2 EUR",
          },
        ],
      },
    ]);
    const walletService = wallet();
    const service = new StoreOrdersProtocolService(database as never, walletService as never, config() as never);

    await service.updateProcessing(orderId, {
      actorId: "operator-1",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      ifMatch: "order:a9d85b61-fcc7-4177-8793-44bb65eef2d0:2026-08-14T16:18:00.000Z:false",
      isProcessed: true,
    });

    expect(walletService.settleOrderHoldWithClient).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        userId: "user-1",
        orderId,
        captureCoinMinor: 26668,
        idempotencyKey: `fulfillment-settle:${orderId}`,
        reason: "fulfillment_terminal",
      }),
    );
    expect(database.transactionQueries).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UPDATE fulfillment_commands"),
        expect.stringContaining("UPDATE order_lines"),
        expect.stringContaining("UPDATE orders"),
        expect.stringContaining("INSERT INTO vv_admin_integration_outbox"),
      ]),
    );
    const outboxCall = database.transactionValues.find((values) => values[0] === `vault.order.${orderId}.completed`);
    expect(outboxCall).toBeDefined();
    expect(JSON.parse(String(outboxCall?.[2]))).toMatchObject({
      eventId: `vault.order.${orderId}.completed`,
      eventType: "order.completed",
      data: {
        externalOrderId: orderId,
        status: "completed",
      },
    });
  });

  it("refuses to complete mixed orders through the manual Apple flow", async () => {
    const database = createDatabase([
      { rows: [orderRow("held")] },
      { rows: [lineRow("held"), { ...lineRow("held"), id: "33333333-3333-4333-8333-333333333333", kind: "steam_refill" }] },
    ]);
    const walletService = wallet();
    const service = new StoreOrdersProtocolService(database as never, walletService as never, config() as never);

    await expect(
      service.updateProcessing(orderId, {
        actorId: "operator-1",
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
        ifMatch: "order:a9d85b61-fcc7-4177-8793-44bb65eef2d0:2026-08-14T16:18:00.000Z:false",
        isProcessed: true,
      }),
    ).rejects.toThrow("Only Apple gift-card orders can be completed manually");
    expect(walletService.settleOrderHoldWithClient).not.toHaveBeenCalled();
  });
});

function orderRow(status: string) {
  return {
    created_at: new Date("2026-08-14T16:17:19.000Z"),
    id: orderId,
    status,
    total_coin_minor: 26668,
    updated_at: new Date("2026-08-14T16:18:00.000Z"),
    user_id: "user-1",
  };
}

function lineRow(status: string) {
  return {
    currency: "EUR",
    delivery_email: "buyer@example.test",
    id: lineId,
    kind: "apple_gift_card",
    line_index: 0,
    nominal_minor: 200,
    product_slug: "apple-eu-eur-2",
    region_code: "EU",
    status,
    title: "Подарочная карта Apple",
    unit_price_coin_minor: 26668,
  };
}

function config() {
  return { integration: { publicOrigin: "https://vaultapp24.com" } };
}

function wallet() {
  return { settleOrderHoldWithClient: vi.fn().mockResolvedValue(undefined) };
}

function createDatabase(results: { rows: unknown[] }[]) {
  const pending = [...results];
  const database = {
    transactionQueries: [] as string[],
    transactionValues: [] as unknown[][],
    query: vi.fn(() => Promise.resolve(pending.shift() ?? { rows: [] })),
    transaction: vi.fn((work: (client: { query: typeof database.query }) => Promise<unknown>) =>
      work({
        query: vi.fn((sql: string, values: readonly unknown[] = []) => {
          database.transactionQueries.push(sql);
          database.transactionValues.push([...values]);
          return Promise.resolve(pending.shift() ?? { rows: [] });
        }),
      }),
    ),
  };
  return database;
}
