import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyArcPayWebhookSignature } from "./arc-pay-webhook-signature";

describe("verifyArcPayWebhookSignature", () => {
  it("verifies payment provider HMAC over event id, timestamp and raw body", () => {
    const rawBody = Buffer.from("{\"event_id\":\"evt_1\"}", "utf8");
    const timestamp = "1785237600";
    const eventId = "019f7841-4b12-7a2f-a42b-5c3a72e3b277";
    const secret = "sandbox-webhook-secret";
    const signature = createHmac("sha256", secret)
      .update(Buffer.concat([Buffer.from(`${eventId}.${timestamp}.`, "utf8"), rawBody]))
      .digest("hex");

    expect(verifyArcPayWebhookSignature({
      eventId,
      now: new Date(Number(timestamp) * 1000),
      rawBody,
      secret,
      signature: `t=${timestamp},v1=${signature}`,
      timestamp,
    })).toBe(true);
    expect(verifyArcPayWebhookSignature({
      eventId,
      now: new Date(Number(timestamp) * 1000),
      rawBody,
      secret,
      signature: `t=${timestamp},v1=${"0".repeat(64)}`,
      timestamp,
    })).toBe(false);
  });
});
