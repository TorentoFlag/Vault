import { forwardRef, Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { NotificationOutboxService } from "./notification-outbox.service";
import { NotificationDispatcher } from "./notification-dispatcher";
import { SmtpMailClient } from "./smtp-mail.client";
import { AppleGiftCardsModule } from "../apple-gift-cards/apple-gift-cards.module";
import { AppleGiftCardsService } from "../apple-gift-cards/apple-gift-cards.service";
import { SlackClient } from "./slack.client";

@Module({
  imports: [DatabaseModule, forwardRef(() => AppleGiftCardsModule)],
  providers: [
    NotificationOutboxService,
    {
      provide: SmtpMailClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new SmtpMailClient(config),
    },
    {
      provide: SlackClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new SlackClient(config),
    },
    {
      provide: NotificationDispatcher,
      inject: [NotificationOutboxService, SmtpMailClient, APP_CONFIG, AppleGiftCardsService, SlackClient],
      useFactory: (outbox: NotificationOutboxService, mail: SmtpMailClient, config: AppConfig, appleCards: AppleGiftCardsService, slack: SlackClient) => {
        return new NotificationDispatcher(outbox, mail, config.notifications.smtpFrom ?? "", appleCards, slack);
      },
    },
  ],
  exports: [NotificationOutboxService, NotificationDispatcher, SmtpMailClient],
})
export class NotificationsModule {}
