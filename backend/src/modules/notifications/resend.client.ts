import { readFileSync } from "node:fs";

import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

import type { AppConfig } from "../../config/app-config";

export type ResendSendInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type ResendGateway = {
  send(input: ResendSendInput): Promise<{ emailId: string }>;
  verifyWebhook(input: { payload: string; headers: { id: string; timestamp: string; signature: string } }): unknown;
};

@Injectable()
export class ResendClient implements ResendGateway {
  private readonly client: Resend | null;
  private readonly from: string | null;
  private readonly webhookSecret: string | null;

  constructor(config: AppConfig) {
    this.client = config.notifications.resendApiKeyFile ? new Resend(readSecret(config.notifications.resendApiKeyFile)) : null;
    this.from = config.notifications.resendFrom ?? null;
    this.webhookSecret = config.notifications.resendWebhookSecretFile ? readSecret(config.notifications.resendWebhookSecretFile) : null;
  }

  isConfigured(): boolean {
    return this.client !== null && this.from !== null;
  }

  async send(input: ResendSendInput): Promise<{ emailId: string }> {
    if (this.client === null || this.from === null) throw new Error("RESEND_NOT_CONFIGURED");
    if (input.from !== this.from) throw new Error("RESEND_FROM_MISMATCH");
    const response = await this.client.emails.send({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }, { idempotencyKey: input.idempotencyKey });
    if (response.error || !response.data.id) throw new Error("RESEND_SEND_REJECTED");
    return { emailId: response.data.id };
  }

  verifyWebhook(input: { payload: string; headers: { id: string; timestamp: string; signature: string } }): unknown {
    if (this.client === null || this.webhookSecret === null) throw new Error("RESEND_WEBHOOK_NOT_CONFIGURED");
    return this.client.webhooks.verify({ payload: input.payload, headers: input.headers, webhookSecret: this.webhookSecret });
  }
}

function readSecret(path: string): string {
  const value = readFileSync(path, "utf8").trim();
  if (!value) throw new Error("NOTIFICATION_SECRET_FILE_EMPTY");
  return value;
}
