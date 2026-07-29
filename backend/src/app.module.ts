import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { DatabaseModule } from "./common/database/database.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { QueueModule } from "./common/queue/queue.module";
import { AppConfigModule } from "./config/app-config.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CartModule } from "./modules/cart/cart.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { FulfillmentModule } from "./modules/fulfillment/fulfillment.module";
import { HealthModule } from "./modules/health/health.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { WalletModule } from "./modules/wallet/wallet.module";

@Module({
  imports: [AppConfigModule, DatabaseModule, QueueModule, HealthModule, AuditModule, AuthModule, CatalogModule, WalletModule, CartModule, CheckoutModule, FulfillmentModule, InventoryModule, OrdersModule, PaymentsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
