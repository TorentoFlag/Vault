import { forwardRef, Module } from "@nestjs/common";

import { DatabaseModule } from "../../common/database/database.module";
import { DatabaseService } from "../../common/database/database.service";
import { APP_CONFIG } from "../../config/app-config.module";
import type { AppConfig } from "../../config/app-config";
import { FulfillmentModule } from "../fulfillment/fulfillment.module";
import { FulfillmentService } from "../fulfillment/fulfillment.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { NotificationOutboxService } from "../notifications/notification-outbox.service";
import { AppleGiftCardsService } from "./apple-gift-cards.service";
import { AppleGiftCardsAdminController } from "./apple-gift-cards.admin.controller";
import { AdminGuard } from "../admin/admin.guard";
import { SessionsModule } from "../sessions/sessions.module";
import { DigitalGoodsController } from "./digital-goods.controller";

@Module({
  imports: [DatabaseModule, forwardRef(() => NotificationsModule), FulfillmentModule, SessionsModule],
  controllers: [AppleGiftCardsAdminController, DigitalGoodsController],
  providers: [AdminGuard, {
    provide: AppleGiftCardsService,
    inject: [DatabaseService, NotificationOutboxService, FulfillmentService, APP_CONFIG],
    useFactory: (database: DatabaseService, outbox: NotificationOutboxService, fulfillment: FulfillmentService, config: AppConfig) => new AppleGiftCardsService(database, outbox, fulfillment, config),
  }],
  exports: [AppleGiftCardsService],
})
export class AppleGiftCardsModule {}
