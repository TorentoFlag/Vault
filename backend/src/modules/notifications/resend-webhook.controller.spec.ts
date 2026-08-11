import { describe, expect, it } from "vitest";

import { ResendWebhookController } from "./resend-webhook.controller";

describe("ResendWebhookController", () => {
  it("verifies Svix headers before storing a redacted event", async () => {
    const verified = { type: "email.delivered", data: { email_id: "re_123" } };
    const resend = {
      verifyWebhook: (input: { headers: { id: string } }) => {
        expect(input.headers.id).toBe("msg_123");
        return verified;
      },
    };
    const outbox = {
      recordWebhookEvent: (input: { providerEventId: string; eventType: string }) => {
        expect(input).toMatchObject({ providerEventId: "msg_123", eventType: "email.delivered" });
        return Promise.resolve("processed" as const);
      },
    };
    const controller = new ResendWebhookController(resend, outbox);

    await expect(controller.handle({ rawBody: Buffer.from('{"ignored":true}') }, "msg_123", "1700000000", "v1,test"))
      .resolves.toEqual({ status: "processed" });
  });
});
