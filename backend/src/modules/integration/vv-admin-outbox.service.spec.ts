import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../config/app-config";
import { VvAdminDispatcher } from "./vv-admin-dispatcher";
import { VvAdminOutboxService, type VvAdminIntegrationEvent } from "./vv-admin-outbox.service";

const event: VvAdminIntegrationEvent = {
  schemaVersion: 1,
  eventId: "evt_vault_order_1",
  eventType: "order.created",
  source: "customer",
  occurredAt: "2026-08-13T12:00:00.000Z",
  site: { externalSiteKey: "vault", domain: "vault.example" },
  subject: { type: "order", externalId: "order-1" },
  data: {
    order: {
      externalOrderId: "order-1",
      displayNumber: "VLT-0001",
      status: "created",
      total: { amountMinor: 125000, currency: "FC", scale: 100 },
      createdAt: "2026-08-13T12:00:00.000Z",
      paidAt: null,
      completedAt: null,
    },
    attributes: {},
  },
};

function createOutbox() {
  return new VvAdminOutboxService({ isConfigured: () => false } as never);
}

function createConfig(secretFile: string): AppConfig {
  return {
    nodeEnv: "test",
    port: 3000,
    admin: {},
    steam: {},
    arcPay: { environment: "sandbox", providerMode: "disabled" },
    sih: {
      marketBaseUrl: "https://api.sih.market",
      maximumBodyBytes: 4096,
      requestTimeoutMs: 2500,
      steamRefillBaseUrl: "https://core.steaminventoryhelper.com",
    },
    catalog: { publicGames: ["cs2"] },
    notifications: {},
    integration: {
      publicOrigin: "https://vault.example",
      adminOrigin: "https://vault.example",
      vvAdminWebhookUrl: "https://admin.example/commerce/webhook",
      vvAdminSiteKey: "vault-site-key",
      vvAdminWebhookSecretFile: secretFile,
    },
    corsOrigins: [],
  };
}

describe("VvAdminOutboxService", () => {
  it("deduplicates events by event id and claims pending work", async () => {
    const outbox = createOutbox();

    const first = await outbox.enqueue(event);
    const second = await outbox.enqueue(event);
    const claimed = await outbox.claimNext();

    expect(second.id).toBe(first.id);
    expect(claimed).toMatchObject({
      id: first.id,
      eventId: "evt_vault_order_1",
      status: "processing",
      attemptCount: 1,
    });
  });

  it("refuses secret-like payloads", async () => {
    const outbox = createOutbox();

    await expect(
      outbox.enqueue({
        ...event,
        data: { attributes: { apiToken: "must-not-leave-site" } },
      }),
    ).rejects.toThrow("SENSITIVE_PAYLOAD");
  });
});

describe("VvAdminDispatcher", () => {
  it("sends a signed event to VV Admin and marks it accepted", async () => {
    const outbox = createOutbox();
    await outbox.enqueue(event);
    const secretFile = join(mkdtempSync(join(tmpdir(), "vv-admin-")), "secret");
    writeFileSync(secretFile, "shared-secret\n", "utf8");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const dispatcher = new VvAdminDispatcher(
      outbox,
      createConfig(secretFile),
      fetchImpl,
      () => new Date("2026-08-13T12:01:00.000Z"),
    );

    await expect(dispatcher.processNext()).resolves.toBe("accepted");

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://admin.example/commerce/webhook");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-vv-site-key"]).toBe("vault-site-key");
    expect(headers["x-vv-event-id"]).toBe("evt_vault_order_1");
    expect(headers["x-vv-signature"]).toMatch(/^sha256=/);
    await expect(outbox.claimNext()).resolves.toBeNull();
  });
});
