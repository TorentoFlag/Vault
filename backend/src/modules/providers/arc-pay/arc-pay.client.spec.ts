import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ArcPayClient } from "./arc-pay.client";

describe("ArcPayClient", () => {
  it("creates an SBP-only hosted checkout session with secret-file auth and idempotency", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-client-"));
    try {
      const keyFile = join(tempDir, "secret-key");
      await writeFile(keyFile, "sk_test_vault_secret\n", "utf8");
      const requests: Array<{ input: string; init: RequestInit }> = [];
      const client = new ArcPayClient({
        apiKeyFile: keyFile,
        baseUrl: "https://api.arc-pay.test/v1",
        fetch: (input, init) => {
          requests.push({ input, init: init ?? {} });
          return Promise.resolve(new Response(JSON.stringify({
            id: "019eb86c-91b2-7ce0-99f1-0a89a8b7b981",
            url: "https://checkout.arc-pay.test/session/019eb86c",
          }), {
            status: 201,
            headers: { "content-type": "application/json" },
          }));
        },
      });

      await expect(client.createHostedCheckout({
        amountMinor: 100_000,
        cancelUrl: "https://vault.example/balance/top-up?payment=cancelled",
        description: "Пополнение баланса Vault Coins",
        externalId: "topup-1",
        failUrl: "https://vault.example/balance/top-up?payment=failed",
        idempotencyKey: "019f7841-4b12-7a2f-a42b-5c3a72e3b277",
        successUrl: "https://vault.example/balance/top-up?payment=success",
      })).resolves.toEqual({
        providerSessionId: "019eb86c-91b2-7ce0-99f1-0a89a8b7b981",
        checkoutUrl: "https://checkout.arc-pay.test/session/019eb86c",
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]?.input).toBe("https://api.arc-pay.test/v1/checkout/sessions");
      expect(requests[0]?.init.headers).toEqual({
        "authorization": "Bearer sk_test_vault_secret",
        "content-type": "application/json",
        "idempotency-key": "019f7841-4b12-7a2f-a42b-5c3a72e3b277",
      });
      const body = requests[0]?.init.body;
      if (typeof body !== "string") throw new Error("Expected JSON body string");
      expect(JSON.parse(body)).toEqual({
        amount: 100_000,
        cancel_url: "https://vault.example/balance/top-up?payment=cancelled",
        capture_mode: "one_stage",
        currency: "RUB",
        description: "Пополнение баланса Vault Coins",
        external_id: "topup-1",
        fail_url: "https://vault.example/balance/top-up?payment=failed",
        locale: "ru",
        metadata: {
          vault_top_up_id: "topup-1",
        },
        payment_methods: [{
          method: "sbp",
          payment_mode: "h2h",
        }],
        success_url: "https://vault.example/balance/top-up?payment=success",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("loads a payment status by payment id for Hosted Checkout webhook correlation", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "vault-arc-pay-payment-"));
    try {
      const keyFile = join(tempDir, "secret-key");
      await writeFile(keyFile, "sk_test_vault_secret\n", "utf8");
      const requests: Array<{ input: string; init: RequestInit }> = [];
      const client = new ArcPayClient({
        apiKeyFile: keyFile,
        baseUrl: "https://api.arc-pay.test/v1",
        fetch: (input, init) => {
          requests.push({ input, init: init ?? {} });
          return Promise.resolve(new Response(JSON.stringify({
            id: "019facd9-9e3f-730f-9180-8a43c1499df7",
            status: "captured",
            amount: 100_000,
            currency: "RUB",
            external_id: "e358a6c5-56f0-460f-9666-46bed1662141",
            metadata: {
              vault_top_up_id: "e358a6c5-56f0-460f-9666-46bed1662141",
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }));
        },
      });

      await expect(client.getPayment("019facd9-9e3f-730f-9180-8a43c1499df7")).resolves.toEqual({
        id: "019facd9-9e3f-730f-9180-8a43c1499df7",
        status: "captured",
        amount: 100_000,
        currency: "RUB",
        externalId: "e358a6c5-56f0-460f-9666-46bed1662141",
        metadata: {
          vault_top_up_id: "e358a6c5-56f0-460f-9666-46bed1662141",
        },
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]?.input).toBe("https://api.arc-pay.test/v1/payments/019facd9-9e3f-730f-9180-8a43c1499df7");
      expect(requests[0]?.init.headers).toEqual({
        "authorization": "Bearer sk_test_vault_secret",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
