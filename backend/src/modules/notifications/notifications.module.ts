import { forwardRef, Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { NotificationOutboxService } from "./notification-outbox.service";
import { NotificationDispatcher } from "./notification-dispatcher";
import { ResendClient } from "./resend.client";
import { ResendWebhookController } from "./resend-webhook.controller";
import { AppleGiftCardsModule } from "../apple-gift-cards/apple-gift-cards.module";
import { AppleGiftCardsService } from "../apple-gift-cards/apple-gift-cards.service";

@Module({
  imports: [DatabaseModule, forwardRef(() => AppleGiftCardsModule)],
  controllers: [ResendWebhookController],
  providers: [
    NotificationOutboxService,
    {
      provide: ResendClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new ResendClient(config),
    },
    {
      provide: NotificationDispatcher,
      inject: [NotificationOutboxService, ResendClient, APP_CONFIG, AppleGiftCardsService],
      useFactory: (outbox: NotificationOutboxService, resend: ResendClient, config: AppConfig, appleCards: AppleGiftCardsService) => {
        return new NotificationDispatcher(outbox, resend, config.notifications.resendFrom ?? "", appleCards);
      },
    },
  ],
  exports: [NotificationOutboxService, NotificationDispatcher, ResendClient],
})
export class NotificationsModule {}
