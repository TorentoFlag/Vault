import { readFileSync } from "node:fs";

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../../common/database/database.service";
import type { AppConfig } from "../../config/app-config";
import { FulfillmentService } from "../fulfillment/fulfillment.service";
import { NotificationOutboxService } from "../notifications/notification-outbox.service";
import { decryptAppleGiftCardCode, encryptAppleGiftCardCode } from "./apple-gift-cards.crypto";

export type ManualAppleGiftCardDeliveryCommand = { actorId: string; code: string; idempotencyKey: string; orderLineId: string; reason: string };

@Injectable()
export class AppleGiftCardsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(NotificationOutboxService) private readonly outbox: NotificationOutboxService,
    @Inject(FulfillmentService) private readonly fulfillment: FulfillmentService,
    private readonly config: AppConfig,
  ) {}

  async recordManualDelivery(command: ManualAppleGiftCardDeliveryCommand): Promise<{ notificationId: string; status: "queued" }> {
    const code = command.code.trim();
    if (code.length < 8 || code.length > 128) throw new BadRequestException("Apple gift-card code length is invalid");
    if (command.reason.trim().length < 10 || command.reason.trim().length > 500) throw new BadRequestException("Delivery reason length is invalid");
    const key = this.encryptionKey();
    const encrypted = encryptAppleGiftCardCode(code, key);
    const row = await this.database.transaction(async (client) => {
      const found = await client.query<{ delivery_email: string; delivery_version: number }>(`
        SELECT apple_gift_card_fulfillments.delivery_email, apple_gift_card_fulfillments.delivery_version
        FROM apple_gift_card_fulfillments
        JOIN fulfillment_commands ON fulfillment_commands.order_line_id = apple_gift_card_fulfillments.order_line_id
        WHERE apple_gift_card_fulfillments.order_line_id = $1
          AND fulfillment_commands.command_type = 'manual_apple_gift_card'
          AND fulfillment_commands.status <> 'completed'
        FOR UPDATE
      `, [command.orderLineId]);
      const fulfillment = found.rows[0];
      if (!fulfillment) throw new NotFoundException("Pending Apple gift-card delivery not found");
      const deliveryVersion = fulfillment.delivery_version + 1;
      await client.query(`
        UPDATE apple_gift_card_fulfillments
        SET code_ciphertext = $2, code_nonce = $3, code_auth_tag = $4, code_version = $5,
            delivery_version = $6, updated_at = clock_timestamp()
        WHERE order_line_id = $1
      `, [command.orderLineId, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, encrypted.version, deliveryVersion]);
      await client.query(`
        INSERT INTO fulfillment_provider_attempts (command_id, operation, status, idempotency_key, request_snapshot)
        SELECT id, 'manual_code_delivery', 'queued', $2, jsonb_build_object('actorId', $3, 'reason', $4)
        FROM fulfillment_commands WHERE order_line_id = $1 AND command_type = 'manual_apple_gift_card'
        ON CONFLICT (command_id, operation, idempotency_key) DO NOTHING
      `, [command.orderLineId, command.idempotencyKey, command.actorId, command.reason.trim()]);
      return { deliveryVersion, email: fulfillment.delivery_email };
    });
    const notification = await this.outbox.enqueue({
      channel: "email",
      eventType: "apple-card.delivery",
      entityId: command.orderLineId,
      idempotencyKey: `apple-card-delivery/${command.orderLineId}/${row.deliveryVersion}`,
      payload: { orderLineId: command.orderLineId, deliveryVersion: row.deliveryVersion },
    });
    return { notificationId: notification.id, status: "queued" };
  }

  async listPending(): Promise<{ items: Array<{ orderLineId: string; title: string; regionCode: string; currency: string; nominalMinor: number; createdAt: string }> }> {
    const result = await this.database.query<{ order_line_id: string; title: string; region_code: string; currency: string; nominal_minor: number; created_at: Date }>(`
      SELECT apple_gift_card_fulfillments.order_line_id, order_lines.title, apple_gift_card_fulfillments.region_code,
             apple_gift_card_fulfillments.currency, apple_gift_card_fulfillments.nominal_minor, apple_gift_card_fulfillments.created_at
      FROM apple_gift_card_fulfillments
      JOIN order_lines ON order_lines.id = apple_gift_card_fulfillments.order_line_id
      JOIN fulfillment_commands ON fulfillment_commands.order_line_id = order_lines.id
      WHERE fulfillment_commands.command_type = 'manual_apple_gift_card'
        AND fulfillment_commands.status <> 'completed'
      ORDER BY apple_gift_card_fulfillments.created_at ASC
    `);
    return { items: result.rows.map((row) => ({ orderLineId: row.order_line_id, title: row.title, regionCode: row.region_code, currency: row.currency, nominalMinor: row.nominal_minor, createdAt: row.created_at.toISOString() })) };
  }

  async listCustomerDigitalGoods(userId: string): Promise<{ items: Array<Record<string, string>> }> {
    const result = await this.database.query<{
      created_at: Date; currency: string; nominal_minor: number; order_id: string; order_line_id: string; product_slug: string; region_code: string; status: string; title: string;
    }>(`
      SELECT order_lines.id AS order_line_id, order_lines.product_slug, order_lines.title, order_lines.status,
             orders.id AS order_id, orders.created_at, apple_gift_card_fulfillments.region_code,
             apple_gift_card_fulfillments.currency, apple_gift_card_fulfillments.nominal_minor
      FROM order_lines
      JOIN orders ON orders.id = order_lines.order_id
      JOIN apple_gift_card_fulfillments ON apple_gift_card_fulfillments.order_line_id = order_lines.id
      WHERE orders.user_id = $1 AND order_lines.kind = 'apple_gift_card'
      ORDER BY orders.created_at DESC, order_lines.line_index ASC
    `, [userId]);
    return {
      items: result.rows.map((row) => ({
        id: row.order_line_id,
        orderNumber: row.order_id,
        productSlug: row.product_slug,
        title: row.title,
        regionLabel: row.region_code,
        nominalDisplay: `${row.nominal_minor / 100} ${row.currency}`,
        status: row.status === "supplier_finished" ? "sent_to_email" : row.status === "manual_review" ? "needs_review" : row.status === "supplier_failed" ? "failed" : "awaiting_manual_delivery",
        purchasedAt: row.created_at.toISOString(),
        activationGuide: "apple_app_store_itunes_v1",
      })),
    };
  }

  async deliveryEmailForNotification(orderLineId: string, deliveryVersion: number): Promise<{ code: string; email: string }> {
    const result = await this.database.query<{ code_auth_tag: string | null; code_ciphertext: string | null; code_nonce: string | null; delivery_email: string; delivery_version: number; code_version: string | null }>(`
      SELECT delivery_email, delivery_version, code_ciphertext, code_nonce, code_auth_tag, code_version
      FROM apple_gift_card_fulfillments WHERE order_line_id = $1
    `, [orderLineId]);
    const row = result.rows[0];
    if (!row || row.delivery_version !== deliveryVersion || !row.code_ciphertext || !row.code_nonce || !row.code_auth_tag || !row.code_version) throw new Error("APPLE_GIFT_CARD_DELIVERY_MATERIAL_NOT_FOUND");
    return { email: row.delivery_email, code: decryptAppleGiftCardCode({ ciphertext: row.code_ciphertext, nonce: row.code_nonce, authTag: row.code_auth_tag, version: row.code_version }, this.encryptionKey()) };
  }

  async completeDeliveryAfterAcceptedSend(orderLineId: string): Promise<void> {
    await this.fulfillment.completeManualAppleGiftCard(orderLineId);
  }

  private encryptionKey(): string {
    const path = this.config.notifications.appleGiftCardEncryptionKeyFile;
    if (!path) throw new Error("APPLE_GIFT_CARD_ENCRYPTION_KEY_NOT_CONFIGURED");
    const key = readFileSync(path, "utf8").trim();
    if (!key) throw new Error("APPLE_GIFT_CARD_ENCRYPTION_KEY_EMPTY");
    return key;
  }
}
