import { Inject, Injectable } from "@nestjs/common";

import { renderAppleOrderAcceptedEmail, renderEmailVerificationEmail, type RenderedEmail } from "./email-templates";
import { NotificationOutboxService, type NotificationOutboxRecord } from "./notification-outbox.service";
import { ResendClient } from "./resend.client";
import type { AppleGiftCardsService } from "../apple-gift-cards/apple-gift-cards.service";

export type NotificationDispatchResult =
  | { status: "none" }
  | { status: "accepted"; notificationId: string }
  | { status: "retry_scheduled"; notificationId: string };

type VerificationPayload = { email: string; expireMinutes: number; otp: string };
type OrderAcceptedPayload = { email: string; orderId: string; productName: string; amount: string; date: string };

function isVerificationPayload(value: Record<string, unknown>): value is VerificationPayload {
  return typeof value.email === "string" && typeof value.otp === "string" && typeof value.expireMinutes === "number";
}

function isOrderAcceptedPayload(value: Record<string, unknown>): value is OrderAcceptedPayload {
  return typeof value.email === "string" && typeof value.orderId === "string" && typeof value.productName === "string" && typeof value.amount === "string" && typeof value.date === "string";
}

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(NotificationOutboxService) private readonly outbox: NotificationOutboxService,
    @Inject(ResendClient) private readonly resend: Pick<ResendClient, "send">,
    private readonly from: string,
    private readonly appleCards?: Pick<AppleGiftCardsService, "completeDeliveryAfterAcceptedSend" | "deliveryEmailForNotification">,
  ) {}

  async processNext(): Promise<NotificationDispatchResult> {
    const notification = await this.outbox.claimNext();
    if (notification === null) return { status: "none" };
    try {
      const email = await this.resolveEmail(notification);
      const accepted = await this.resend.send({ ...email.message, from: this.from, to: email.to, idempotencyKey: notification.idempotencyKey });
      await this.outbox.markAccepted(notification.id, accepted.emailId);
      if (notification.eventType === "apple-card.delivery") await this.appleCards?.completeDeliveryAfterAcceptedSend(notification.entityId);
      return { status: "accepted", notificationId: notification.id };
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "NOTIFICATION_DISPATCH_FAILED";
      await this.outbox.markRetryableFailure(notification.id, errorCode);
      return { status: "retry_scheduled", notificationId: notification.id };
    }
  }

  private async resolveEmail(notification: NotificationOutboxRecord): Promise<{ to: string; message: RenderedEmail }> {
    if (notification.channel !== "email") throw new Error("NOTIFICATION_CHANNEL_UNSUPPORTED");
    if (notification.eventType === "email.verification" && isVerificationPayload(notification.payload)) {
      return { to: notification.payload.email, message: renderEmailVerificationEmail({ code: notification.payload.otp, expireMinutes: notification.payload.expireMinutes }) };
    }
    if (notification.eventType === "apple-card.order-accepted" && isOrderAcceptedPayload(notification.payload)) {
      return { to: notification.payload.email, message: renderAppleOrderAcceptedEmail(notification.payload) };
    }
    if (notification.eventType === "apple-card.delivery" && this.appleCards && typeof notification.payload.deliveryVersion === "number") {
      const material = await this.appleCards.deliveryEmailForNotification(notification.entityId, notification.payload.deliveryVersion);
      return {
        to: material.email,
        message: {
          subject: "Код подарочной карты Apple — Vault",
          text: `Здравствуйте!\n\nВаш код подарочной карты Apple: ${material.code}\n\nС уважением,\nКоманда Vault`,
          html: `<p>Здравствуйте!</p><p>Ваш код подарочной карты Apple:</p><p><strong>${material.code}</strong></p><p>С уважением,<br>Команда Vault</p>`,
        },
      };
    }
    throw new Error("NOTIFICATION_EVENT_PAYLOAD_INVALID");
  }
}
